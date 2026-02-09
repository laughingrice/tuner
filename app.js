const { useState, useEffect, useRef, useCallback } = React;

// --- AUDIO LOGIC & MATH ---

// Note strings
const NOTE_STRINGS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Standard Guitar Frequencies for Polyphonic mapping
const GUITAR_STRINGS = [
    { note: 'E', octave: 2, freq: 82.41 },
    { note: 'A', octave: 2, freq: 110.00 },
    { note: 'D', octave: 3, freq: 146.83 },
    { note: 'G', octave: 3, freq: 196.00 },
    { note: 'B', octave: 3, freq: 246.94 },
    { note: 'E', octave: 4, freq: 329.63 }
];

// Auto-correlation algorithm to detect pitch
const autoCorrelate = (buf, sampleRate) => {
    let SIZE = buf.length;
    let rms = 0;

    // 1. Calculate RMS (Root Mean Square) to detect silence
    for (let i = 0; i < SIZE; i++) {
        const val = buf[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    
    // Gate: Signal too quiet
    if (rms < 0.01) return -1;

    // 2. Auto-correlation
    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
        if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    }
    for (let i = 1; i < SIZE / 2; i++) {
        if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    }

    buf = buf.slice(r1, r2);
    SIZE = buf.length;

    const c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++) {
        for (let j = 0; j < SIZE - i; j++) {
            c[i] = c[i] + buf[j] * buf[j + i];
        }
    }

    let d = 0; 
    while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    
    for (let i = d; i < SIZE; i++) {
        if (c[i] > maxval) {
            maxval = c[i];
            maxpos = i;
        }
    }
    
    let T0 = maxpos;

    // Parabolic Interpolation for higher precision
    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
};

// --- VISUAL COMPONENTS ---

const StrobeBand = ({ speed, direction }) => {
    const duration = speed === 0 ? '0s' : `${1 / Math.abs(speed)}s`;
    const animationName = direction === 'sharp' ? 'strobe-spin-right' : 'strobe-spin-left';
    
    const style = {
        animation: speed === 0 ? 'none' : `${animationName} ${duration} linear infinite`,
    };

    return (
        <div className="w-full h-12 bg-zinc-800 border-y border-zinc-700 overflow-hidden relative mb-2">
            <div className="absolute inset-0 strobe-pattern opacity-50" style={style}></div>
            <div className="absolute top-0 bottom-0 left-1/2 w-1 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] z-10 -translate-x-1/2"></div>
        </div>
    );
};

const ChromaticNeedle = ({ cents }) => {
    // Clamp visual rotation
    const rotation = Math.max(-45, Math.min(45, cents));
    // Determine color
    const isTuned = Math.abs(cents) < 3;
    const color = isTuned ? 'text-green-400' : 'text-red-400';
    
    return (
        <div className="relative w-64 h-32 flex justify-center items-end overflow-hidden mb-6">
            <div className="absolute bottom-0 w-full h-full border-t-2 border-zinc-600 rounded-t-full opacity-30"></div>
            {/* Ticks */}
            <div className="absolute bottom-0 w-1 h-4 bg-zinc-500"></div>
            <div className="absolute bottom-0 w-1 h-3 bg-zinc-600 rotate-45 origin-bottom translate-x-16 -translate-y-2"></div>
            <div className="absolute bottom-0 w-1 h-3 bg-zinc-600 -rotate-45 origin-bottom -translate-x-16 -translate-y-2"></div>

            {/* Needle */}
            <div 
                className={`w-1 h-28 origin-bottom bg-current transition-transform duration-100 ease-linear shadow-[0_0_15px_currentColor] ${color}`}
                style={{ transform: `rotate(${rotation}deg)` }}
            ></div>
            <div className="absolute bottom-[-10px] w-4 h-4 bg-zinc-200 rounded-full z-10"></div>
        </div>
    );
};

const PolyphonicDisplay = ({ detectedFreq, refFreq }) => {
    // This is a "Pseudo-Polyphonic" display.
    // It maps the detected frequency to the closest known guitar string.
    
    return (
        <div className="flex justify-between items-end w-full max-w-md h-32 px-4 gap-2">
            {GUITAR_STRINGS.map((str, idx) => {
                // Calculate theoretical frequency for this string based on current refFreq
                // Standard tuning is based on A4=440. We scale it.
                const scaleFactor = refFreq / 440; 
                const targetFreq = str.freq * scaleFactor;
                
                // Is this the string being played? (Simple proximity check)
                const isActive = detectedFreq && Math.abs(detectedFreq - targetFreq) < 20; // within 20Hz
                
                let cents = 0;
                let isTuned = false;

                if (isActive) {
                    // Calculate cents for this specific string
                    const semitones = 12 * (Math.log2(detectedFreq / targetFreq));
                    cents = semitones * 100;
                    isTuned = Math.abs(cents) < 5;
                }

                // Visual Height
                const transY = isActive ? cents * -1 : 0;
                
                return (
                    <div key={idx} className={`flex flex-col items-center gap-2 w-full transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-40'}`}>
                        <div className="h-full w-full bg-zinc-800 rounded-full relative flex items-center justify-center overflow-hidden">
                             <div 
                                className={`w-2 rounded-full transition-all duration-100 ${isTuned ? 'bg-green-500 h-2 w-full shadow-[0_0_10px_#22c55e]' : 'bg-red-500 h-1'}`}
                                style={{ transform: `translateY(${transY}px)` }}
                             ></div>
                             <div className="absolute w-full h-[1px] bg-white opacity-20"></div>
                        </div>
                        <span className="text-zinc-400 font-bold text-sm">{str.note}</span>
                    </div>
                );
            })}
        </div>
    );
};

// --- MAIN APP ---

const TunerApp = () => {
    // UI State
    const [mode, setMode] = useState('chromatic');
    const [refFreq, setRefFreq] = useState(440);
    const [keepAwake, setKeepAwake] = useState(false);
    const [isListening, setIsListening] = useState(false);
    
    // Tuning State
    const [tuningData, setTuningData] = useState({ 
        note: '--', 
        octave: '', 
        cents: 0, 
        frequency: 0 
    });

    // Audio Refs
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const micStreamRef = useRef(null);
    const requestRef = useRef(null);
    const wakeLockRef = useRef(null);

    // --- WAKE LOCK LOGIC ---
    const requestWakeLock = useCallback(async () => {
        if ('wakeLock' in navigator) {
            try {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
                // Re-acquire on visibility change
                document.addEventListener('visibilitychange', handleVisibilityChange);
            } catch (err) {
                console.warn(`${err.name}, ${err.message}`);
                setKeepAwake(false);
            }
        }
    }, []);

    const releaseWakeLock = useCallback(async () => {
        if (wakeLockRef.current) {
            await wakeLockRef.current.release();
            wakeLockRef.current = null;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        }
    }, []);

    const handleVisibilityChange = async () => {
        if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
            await requestWakeLock();
        }
    };

    useEffect(() => {
        if (keepAwake) requestWakeLock();
        else releaseWakeLock();
        return () => releaseWakeLock();
    }, [keepAwake, requestWakeLock, releaseWakeLock]);


    // --- TUNER LOOP ---
    const updatePitch = () => {
        if (!analyserRef.current) return;

        const buffer = new Float32Array(analyserRef.current.fftSize);
        analyserRef.current.getFloatTimeDomainData(buffer);
        
        const frequency = autoCorrelate(buffer, audioContextRef.current.sampleRate);

        if (frequency === -1) {
            // No signal / Silence
            // Don't reset immediately to prevent flickering, just stop updating
            // Or decay slowly. For now, we hold the last note or show nothing if long silence.
            // setTuningData(prev => ({ ...prev, frequency: 0 })); 
        } else {
            // Calculate Note info based on RefFreq
            const noteNum = 12 * (Math.log(frequency / refFreq) / Math.log(2)) + 69;
            const noteIndex = Math.round(noteNum);
            const noteName = NOTE_STRINGS[noteIndex % 12];
            const octave = Math.floor(noteIndex / 12) - 1;
            
            // Calculate Cents
            // Frequency of the "perfect" note
            const perfectFreq = refFreq * Math.pow(2, (noteIndex - 69) / 12);
            const cents = 1200 * Math.log2(frequency / perfectFreq);

            setTuningData({
                note: noteName,
                octave: octave,
                cents: cents,
                frequency: frequency
            });
        }

        requestRef.current = requestAnimationFrame(updatePitch);
    };

    // --- MIC HANDLING ---
    const startMic = async () => {
        if (audioContextRef.current) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 2048;

            const microphone = audioContextRef.current.createMediaStreamSource(stream);
            microphone.connect(analyserRef.current);
            
            micStreamRef.current = stream;
            setIsListening(true);
            requestRef.current = requestAnimationFrame(updatePitch);
        } catch (err) {
            console.error("Mic Error:", err);
            alert("Could not access microphone. Please allow permissions.");
        }
    };

    const stopMic = () => {
        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach(track => track.stop());
            micStreamRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        if (requestRef.current) {
            cancelAnimationFrame(requestRef.current);
        }
        setIsListening(false);
        setTuningData({ note: '--', octave: '', cents: 0, frequency: 0 });
    };

    const toggleMic = () => {
        if (isListening) stopMic();
        else startMic();
    };


    // Helper for Styles
    const stepButtonStyle = "w-12 h-12 flex items-center justify-center bg-zinc-900 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 active:scale-95 transition-all border border-transparent hover:border-zinc-700 cursor-pointer select-none";
    const isSharp = tuningData.cents > 0;
    // Strobe speed: closer to 0 cents = slower. 
    // We visually clamp it so it doesn't spin insanely fast on wrong notes
    const strobeSpeed = (tuningData.cents / 50); 

    return (
        <div className="flex flex-col md:flex-row w-full h-full max-w-5xl max-h-[600px] bg-zinc-950 rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden">
            
            {/* LEFT: Display */}
            <div className="flex-grow relative flex flex-col items-center justify-center p-8 bg-gradient-to-br from-black to-zinc-900">
                
                {/* Note Display */}
                <div className="flex flex-col items-center mb-8 z-10 min-h-[160px]">
                    <div className="text-9xl font-black text-white tracking-tighter flex items-start drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                        {tuningData.note}
                        <span className="text-4xl mt-2 text-zinc-500 font-normal">{tuningData.octave}</span>
                    </div>
                    {tuningData.note !== '--' && (
                        <div className={`text-xl font-mono mt-2 ${Math.abs(tuningData.cents) < 3 ? 'text-green-500' : 'text-red-500'}`}>
                            {tuningData.cents > 0 ? '+' : ''}{Math.floor(tuningData.cents)} cents
                        </div>
                    )}
                     {tuningData.note === '--' && isListening && (
                        <div className="text-zinc-600 font-mono mt-4 animate-pulse">Listening...</div>
                    )}
                    {!isListening && (
                        <div className="text-zinc-600 font-mono mt-4">Mic Off</div>
                    )}
                </div>

                {/* Visualizers */}
                <div className="w-full flex flex-col items-center justify-center h-48">
                    {mode === 'chromatic' && <ChromaticNeedle cents={tuningData.cents} />}
                    
                    {mode === 'strobe' && (
                        <div className="w-full max-w-lg opacity-90">
                            {/* Pass frequency/cents to strobe logic */}
                            <StrobeBand speed={strobeSpeed} direction={isSharp ? 'sharp' : 'flat'} />
                            <StrobeBand speed={strobeSpeed * 1.5} direction={isSharp ? 'sharp' : 'flat'} />
                            <StrobeBand speed={strobeSpeed * 0.75} direction={isSharp ? 'sharp' : 'flat'} />
                        </div>
                    )}
                    
                    {mode === 'polyphonic' && (
                        <PolyphonicDisplay detectedFreq={tuningData.frequency} refFreq={refFreq} />
                    )}
                </div>
            </div>

            {/* RIGHT: Controls */}
            <div className="w-full md:w-80 bg-zinc-900 border-l border-zinc-800 p-6 flex flex-col gap-6 shadow-xl z-20 overflow-y-auto no-scrollbar">
                
                {/* Header */}
                <div className="border-b border-zinc-700 pb-2">
                    <h2 className="text-zinc-400 text-xs font-bold uppercase tracking-widest">Tuning Master Pro</h2>
                </div>

                {/* 1. Mode Switch */}
                <div className="flex flex-col gap-2">
                    <label className="text-zinc-500 text-xs uppercase font-bold">Tuner Mode</label>
                    <div className="bg-zinc-950 p-1 rounded-lg border border-zinc-800 flex flex-col gap-1">
                        {['chromatic', 'polyphonic', 'strobe'].map((m) => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                className={`text-left px-4 py-3 rounded-md text-sm font-medium transition-all duration-200 flex items-center justify-between group ${
                                    mode === m 
                                    ? 'bg-zinc-800 text-white shadow-md border border-zinc-700' 
                                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                                }`}
                            >
                                <span className="capitalize">{m}</span>
                                <div className={`w-2 h-2 rounded-full ${mode === m ? 'bg-blue-500 shadow-[0_0_8px_#3b82f6]' : 'bg-zinc-700'}`}></div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 2. Reference Pitch */}
                <div className="flex flex-col gap-2">
                    <label className="text-zinc-500 text-xs uppercase font-bold">Reference Pitch (Hz)</label>
                    <div className="flex items-center justify-between bg-zinc-950 rounded-lg border border-zinc-800 p-1">
                        <button onClick={() => setRefFreq(r => r - 1)} className={stepButtonStyle}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18 12H6"></path></svg>
                        </button>
                        <input 
                            type="number" 
                            value={refFreq}
                            onChange={(e) => setRefFreq(parseInt(e.target.value) || 440)}
                            className="w-24 bg-transparent text-center text-2xl font-mono text-white focus:outline-none appearance-none border-none m-0 p-0"
                        />
                        <button onClick={() => setRefFreq(r => r + 1)} className={stepButtonStyle}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                        </button>
                    </div>
                </div>

                {/* 3. Keep Screen On */}
                <div className="flex items-center justify-between bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                    <label className="text-zinc-400 text-xs font-bold uppercase cursor-pointer" onClick={() => setKeepAwake(!keepAwake)}>
                        Keep Screen On
                    </label>
                    <button 
                        onClick={() => setKeepAwake(!keepAwake)}
                        className={`w-12 h-6 rounded-full relative transition-colors duration-300 focus:outline-none ${keepAwake ? 'bg-blue-600' : 'bg-zinc-700'}`}
                    >
                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-300 shadow-md ${keepAwake ? 'translate-x-6' : 'translate-x-0'}`}></div>
                    </button>
                </div>

                {/* Mic Toggle Button / Status */}
                <div className="mt-auto pt-4 border-t border-zinc-800">
                    <button 
                        onClick={toggleMic}
                        className={`w-full flex items-center justify-center gap-2 py-3 rounded-md font-bold text-sm transition-all ${
                            isListening 
                            ? 'bg-red-900/30 text-red-200 border border-red-900 hover:bg-red-900/50' 
                            : 'bg-green-900/30 text-green-200 border border-green-900 hover:bg-green-900/50'
                        }`}
                    >
                        <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
                        {isListening ? 'STOP INPUT' : 'START TUNER'}
                    </button>
                </div>

            </div>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<TunerApp />);