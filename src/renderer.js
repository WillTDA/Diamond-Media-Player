const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

const openFileBtn = document.getElementById('openFile');
const audioPlayer = document.getElementById('audioPlayer');
const videoPlayer = document.getElementById('videoPlayer');
const currentFile = document.getElementById('currentFile');
const nowPlaying = document.getElementById('now-playing');
const lufsDisplay = document.getElementById('lufs-display');
const controls = document.getElementById('controls');
const visualiser = document.getElementById('visualiser-canvas');
const progressBar = document.getElementById('progress-bar');
const progress = document.getElementById('progress');
const volumeSlider = document.getElementById('volumeSlider');
const volumeIcon = document.querySelector('.volume-icon');
const currentTimeDisplay = document.getElementById('current-time');
const remainingTimeDisplay = document.getElementById('remaining-time');
const playPauseButton = document.getElementById('playPauseButton');
const prevButton = document.getElementById('prevButton');
const nextButton = document.getElementById('nextButton');

let audioContext;
let animationFrameId; // ID of the requestAnimationFrame loop
let lufsNode, source;
let leftGainCanvas, rightGainCanvas;
let leftRMSCtx, rightRMSCtx;
let peakRMS = { left: -Infinity, right: -Infinity, overall: -Infinity }; // peak RMS tracker
let analyser;
let dataArray;
let currentFolder = null;
let currentIndex = -1;
let playlist = [];
let supportedFormats = ['.mp3', '.wav', '.ogg', '.mp4', '.webm', '.mkv', '.ogv'];

// variables customisable by the user
let visualiserFftSize = 1024;
let volume = 100; // default volume is max

ipcRenderer.on('load-preferences', async (event, preferences) => {
    console.log('Loading preferences:', preferences);
    if (preferences.visualiserFftSize) visualiserFftSize = parseInt(preferences.visualiserFftSize, 10);

    if (preferences.volume) {
        volume = parseInt(preferences.volume, 10);
        volumeSlider.value = volume;
        audioPlayer.volume = volume / 100;
        videoPlayer.volume = volume / 100;
        updateVolumeIcon(volume / 100);
    }

    setupVisualiser();
});

openFileBtn.addEventListener('click', () => {
    ipcRenderer.send('open-file-dialog');
});

ipcRenderer.on('selected-file', handleFileOpen);
ipcRenderer.on('open-file', handleFileOpen);

function handleFileOpen(event, filePath) {
    currentFolder = path.dirname(filePath);
    loadPlaylist(currentFolder, filePath);
    loadMedia(filePath);
}

function loadPlaylist(folder, selectedFile) {
    fs.readdir(folder, (err, files) => {
        if (err) {
            console.error('Error reading directory:', err);
            return;
        }
        playlist = files.filter(file => supportedFormats.includes(path.extname(file).toLowerCase()));
        currentIndex = playlist.indexOf(path.basename(selectedFile));
        updateButtonStates();
    });
}

function loadMedia(filePath) {
    if (!filePath) return;
    const ext = path.extname(filePath).toLowerCase();
    if (!supportedFormats.includes(ext)) return;

    const isVideo = ['.mp4', '.webm', '.mkv', '.ogv'].includes(ext);
    const mediaElement = isVideo ? videoPlayer : audioPlayer;

    document.getElementById('logo').classList.add('d-none'); // Hide logo
    mediaElement.src = filePath;
    let filename = path.basename(filePath).replace(/\.[^/.]+$/, '');
    currentFile.textContent = filename;
    nowPlaying.textContent = `Now playing: ${path.basename(filePath)}`;
    controls.classList.remove('d-none');

    if (isVideo) {
        videoPlayer.classList.remove('d-none');
        audioPlayer.classList.add('d-none');
        cleanupAudio();
        hideAudioUI();
        audioPlayer.src = '';
    } else {
        videoPlayer.classList.add('d-none');
        audioPlayer.classList.remove('d-none');
        videoPlayer.src = '';
        showAudioUI();
        setupVisualiser();
    }

    updateButtonStates();
    togglePlayPause();
    lufsDisplay.textContent = 'LUFS: -∞ dB | RMS: -∞ dB';
}

function hideAudioUI() {
    visualiser.classList.add('d-none');
    lufsDisplay.classList.add('d-none');
    document.getElementById('left-gain-canvas').classList.add('d-none');
    document.getElementById('right-gain-canvas').classList.add('d-none');
}

function showAudioUI() {
    visualiser.classList.remove('d-none');
    lufsDisplay.classList.remove('d-none');
    document.getElementById('left-gain-canvas').classList.remove('d-none');
    document.getElementById('right-gain-canvas').classList.remove('d-none');
}

function updateButtonStates() {
    prevButton.disabled = currentIndex <= 0;
    nextButton.disabled = currentIndex >= playlist.length - 1;
}

playPauseButton.addEventListener('click', togglePlayPause);
prevButton.addEventListener('click', playPrevious);
nextButton.addEventListener('click', playNext);

function togglePlayPause() {
    const mediaPlayer = videoPlayer.classList.contains('d-none') ? audioPlayer : videoPlayer;
    if (mediaPlayer.paused) {
        mediaPlayer.play();
        playPauseButton.innerHTML = '<i class="material-icons-round">pause_circle</i>';
    } else {
        mediaPlayer.pause();
        playPauseButton.innerHTML = '<i class="material-icons-round">play_circle</i>';
    }
}

function playPrevious() {
    if (currentIndex > 0) {
        currentIndex--;
        loadMedia(path.join(currentFolder, playlist[currentIndex]));
    }
}

function playNext() {
    if (currentIndex < playlist.length - 1) {
        currentIndex++;
        loadMedia(path.join(currentFolder, playlist[currentIndex]));
    }
}

function updateVolumeIcon(volume) {
    if (volume > 0.5) {
        volumeIcon.textContent = 'volume_up';
    } else if (volume > 0) {
        volumeIcon.textContent = 'volume_down';
    } else {
        volumeIcon.textContent = 'volume_off';
    }
}

audioPlayer.addEventListener('timeupdate', updateProgress);
videoPlayer.addEventListener('timeupdate', updateProgress);
progressBar.addEventListener('click', seek);
progressBar.addEventListener('mousedown', startSeek);
progressBar.addEventListener('mouseleave', endSeek);

let isSeeking = false;

function startSeek() {
    isSeeking = true;
    progressBar.addEventListener('mousemove', updateSeek);
    progressBar.addEventListener('mouseup', endSeek);
}

function updateSeek(e) {
    if (isSeeking) {
        seek(e);
    }
}

function endSeek() {
    isSeeking = false;
    progressBar.removeEventListener('mousemove', updateSeek);
    progressBar.removeEventListener('mouseup', endSeek);
}

volumeSlider.addEventListener('input', function () {
    const volume = this.value / 100;
    audioPlayer.volume = volume;
    videoPlayer.volume = volume;
    updateVolumeIcon(volume);

    //save volume to preferences
    ipcRenderer.send('save-preferences', { volume: this.value }, false); // reload all preferences = false
});

updateVolumeIcon(audioPlayer.volume);

function updateProgress() {
    const mediaPlayer = videoPlayer.classList.contains('d-none') ? audioPlayer : videoPlayer;
    const percent = (mediaPlayer.currentTime / mediaPlayer.duration) * 100;
    progress.style.width = `${percent}%`;
    currentTimeDisplay.textContent = formatTime(mediaPlayer.currentTime);
    remainingTimeDisplay.textContent = formatTime(mediaPlayer.duration - mediaPlayer.currentTime);
    if (mediaPlayer.currentTime === mediaPlayer.duration) {
        playPauseButton.innerHTML = '<i class="material-icons-round">play_circle</i>';
    }
}

function seek(e) {
    const mediaPlayer = videoPlayer.classList.contains('d-none') ? audioPlayer : videoPlayer;
    const percent = e.offsetX / progressBar.offsetWidth;
    mediaPlayer.currentTime = percent * mediaPlayer.duration;
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '--:--';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function cleanupAudio() {
    // Stop any ongoing animations
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }

    // Disconnect and clean up existing audio nodes if they exist
    if (source) {
        source.disconnect();
    }
    if (analyser) {
        analyser.disconnect();
    }
    if (lufsNode && lufsNode.node) {
        lufsNode.node.disconnect();
    }

    //reset peak RMS
    peakRMS = { left: -Infinity, right: -Infinity, overall: -Infinity };
}

function setupVisualiser() {
    cleanupAudio();

    // Initialize audio context and nodes if not already done
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        lufsNode = createLoudnessMonitor(audioContext);
        source = audioContext.createMediaElementSource(audioPlayer);
    }

    // Connect source to LUFS meter, analyser, and destination
    source.connect(lufsNode.node);
    lufsNode.node.connect(audioContext.destination);
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    analyser.fftSize = visualiserFftSize;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    const canvasCtx = visualiser.getContext('2d');

    // Setup gain canvases
    leftGainCanvas = document.getElementById('left-gain-canvas');
    rightGainCanvas = document.getElementById('right-gain-canvas');

    leftRMSCtx = leftGainCanvas.getContext('2d');
    rightRMSCtx = rightGainCanvas.getContext('2d');

    // Set canvas sizes
    visualiser.width = visualiser.offsetWidth;
    visualiser.height = visualiser.offsetHeight;
    leftGainCanvas.width = leftGainCanvas.offsetWidth;
    leftGainCanvas.height = leftGainCanvas.offsetHeight;
    rightGainCanvas.width = rightGainCanvas.offsetWidth;
    rightGainCanvas.height = rightGainCanvas.offsetHeight;

    // Draw initial state for gain bars and loudness meter
    drawRMSCanvas(leftRMSCtx, -Infinity);
    drawRMSCanvas(rightRMSCtx, -Infinity);

    function draw() {
        animationFrameId = requestAnimationFrame(draw);

        analyser.getByteFrequencyData(dataArray);

        // Update main visualiser
        updateMainVisualiser(canvasCtx, bufferLength);

        // Update LUFS display
        updateLUFSDisplay();
    }

    draw();
}

function updateMainVisualiser(canvasCtx, bufferLength) {
    // Clear canvas
    canvasCtx.fillStyle = 'rgb(26, 26, 26)';
    canvasCtx.fillRect(0, 0, canvasCtx.canvas.width, canvasCtx.canvas.height);

    const barWidth = (canvasCtx.canvas.width / bufferLength) * 5;
    let barHeight;
    let x = 5;

    for (let i = 0; i < bufferLength; i++) {
        barHeight = Math.pow(dataArray[i] / 255, 2) * canvasCtx.canvas.height;

        // Calculate color based on loudness
        const hue = 60 - (dataArray[i] / 48) * 60;
        const color = `hsl(${hue}, 100%, 50%)`;

        canvasCtx.fillStyle = color;
        canvasCtx.fillRect(x, canvasCtx.canvas.height - barHeight, barWidth, barHeight);

        x += barWidth - 1;
    }
}

function drawRMSCanvas(ctx, rmsDB, side) {
    if (rmsDB === -Infinity) {
        peakRMS[side] = -Infinity; // reset peak RMS if no audio is playing
        peakRMS.overall = -Infinity; // reset overall peak RMS if no audio is playing
    }
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const minDB = -60; // Effectively -Infinity
    const maxDB = 6;
    const range = maxDB - minDB;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Clamp RMS value between minDB and maxDB
    const clampedRMS = Math.max(minDB, Math.min(maxDB, rmsDB));

    // Calculate bar height logarithmically
    const barHeight = height * (1 - (Math.log10((clampedRMS - minDB) / range + 1) / Math.log10(2)));

    // Draw RMS bar
    ctx.fillStyle = rmsDB > 0 ? 'red' : '#00ff00';
    ctx.fillRect(0, barHeight, width, height - barHeight);

    // Draw thick line at 0dB
    const zeroDbY = height * (1 - (Math.log10((-minDB) / range + 1) / Math.log10(2)));
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, zeroDbY, width, 3);

    //draw a thin green or red line at the peak RMS level
    peakRMS[side] = Math.max(peakRMS[side], rmsDB); // track the peak RMS level for this channel
    peakRMS.overall = Math.max(peakRMS.overall, peakRMS[side]); // track the overall peak RMS level
    const peakY = height * (1 - (Math.log10((peakRMS[side] - minDB) / range + 1) / Math.log10(2)));
    ctx.fillStyle = peakRMS[side] > 0 ? 'red' : 'green';
    ctx.fillRect(0, peakY, width, 2.5);
    // Check for clipping and draw a red line at the top if clipping
    if (rmsDB > 0) {
        ctx.fillStyle = 'red';
        ctx.fillRect(0, 0, width, 5);
    }

    ctx.restore();

    ctx.restore();

    // Draw current RMS value
    ctx.save();
    ctx.translate(width / 2, barHeight + 50);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial'; // Added 'bold' to make the text bold
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 1)'; // Added drop shadow
    ctx.shadowBlur = 1; // Added drop shadow
    ctx.shadowOffsetX = 2; // Added drop shadow
    ctx.shadowOffsetY = 2; // Added drop shadow

    if (rmsDB > 0) ctx.fillStyle = 'yellow';
    let rmsDBText = rmsDB === -Infinity ? '-∞' : rmsDB.toFixed(1);
    ctx.fillText(rmsDBText + ' dB', 0, 0);

    ctx.restore();
}

function createLoudnessMonitor(audioContext) {
    const bufferSize = 1024;
    const meter = audioContext.createScriptProcessor(bufferSize, 2, 2);
    let lufs = -70;
    const windowSize = audioContext.sampleRate * 4; // 2-second window
    let samples = new Float32Array(windowSize);
    let sampleIndex = 0;
    let totalSamples = 0;
    let sumOfSquares = 0;
    let rmsLeft = 0;
    let rmsRight = 0;

    // K-weighting filter coefficients (simplified)
    function kWeightingFilter(sample) {
        // Apply a simple high-pass filter as a placeholder for K-weighting
        const a = 1.5; // Placeholder coefficient
        return sample * a;
    }

    meter.onaudioprocess = function (e) {
        const inputBuffer = e.inputBuffer;
        const leftChannel = inputBuffer.getChannelData(0);
        const rightChannel = inputBuffer.getChannelData(1);

        let sumSquaresLeft = 0;
        let sumSquaresRight = 0;

        for (let i = 0; i < bufferSize; i++) {
            const mono = 0.5 * (leftChannel[i] + rightChannel[i]);
            const filtered = kWeightingFilter(mono);

            // LUFS calculation
            if (Math.abs(filtered) >= 0.0001) {
                samples[sampleIndex] = filtered * filtered;
                sampleIndex = (sampleIndex + 1) % windowSize;
                totalSamples++;
                sumOfSquares += filtered * filtered;
            }

            // RMS calculation
            sumSquaresLeft += leftChannel[i] * leftChannel[i];
            sumSquaresRight += rightChannel[i] * rightChannel[i];
        }

        // Calculate LUFS
        const sum = samples.reduce((acc, val) => acc + val, 0);
        const meanSquare = sum / windowSize;
        lufs = Math.max(-70, 10 * Math.log10(meanSquare) - 0.691);

        // Calculate RMS for left and right channels
        rmsLeft = Math.sqrt(sumSquaresLeft / bufferSize);
        rmsRight = Math.sqrt(sumSquaresRight / bufferSize);
    };

    return {
        node: meter,
        get lufs() { return lufs; },
        get rmsLeftDB() { return 20 * Math.log10(rmsLeft) + 6; },
        get rmsRightDB() { return 20 * Math.log10(rmsRight) + 6; }
    };
}

// Update the LUFS display more frequently
function updateLUFSDisplay() {
    if (lufsNode) {
        const lufs = lufsNode.lufs;
        drawRMSCanvas(leftRMSCtx, lufsNode.rmsLeftDB, 'left');
        drawRMSCanvas(rightRMSCtx, lufsNode.rmsRightDB, 'right');
        lufsDisplay.textContent = `LUFS: ${lufs === -70 || audioPlayer.paused || audioPlayer.volume === 0 ? '-∞' : lufs.toFixed(2)} dB | Peak RMS: ${peakRMS.overall.toFixed(2) === '-Infinity' ? '-∞' : peakRMS.overall.toFixed(2)} dB`;
    }
}

// Ensure the canvas size matches its display size
function resizeCanvas() {
    visualiser.width = visualiser.clientWidth;
    visualiser.height = visualiser.clientHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

document.addEventListener('dragover', function (event) {
    event.preventDefault();
    document.getElementById('drop-area').classList.remove('d-none');
});

document.addEventListener('dragleave', function (event) {
    event.preventDefault();
    if (event.target === document.getElementById('drop-area')) {
        document.getElementById('drop-area').classList.add('d-none');
    }
});

document.addEventListener('drop', function (event) {
    event.preventDefault();
    document.getElementById('drop-area').classList.add('d-none');

    const files = event.dataTransfer.files;
    if (files.length > 0) {
        const filePath = files[0].path;
        currentFolder = path.dirname(filePath);
        loadPlaylist(currentFolder, filePath);
        loadMedia(filePath);
    }
});