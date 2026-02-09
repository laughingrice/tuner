const { useState, useEffect, useRef, useCallback } = React;

// --- AUDIO LOGIC & MATH ---
const NOTE_STRINGS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const GUITAR_STRINGS = [
    { note: 'E', octave: 2, freq: 82.41 },
    { note: 'A', octave: 2, freq: 110.00 },
    { note: 'D', octave: 3, freq: 146.83 },
    { note: 'G', octave: 3, freq: 196.00 },
    { note: 'B', octave: 3, freq: 246.94 },
    { note: 'E', octave: 4, freq: 329.63 }
];

const autoCorrelate = (buf, sampleRate) => {
    let SIZE = buf.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) {
        const val = buf[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;

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
    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
};

// --- VISUAL COMPONENTS ---

const StrobeBand = ({ speed, direction }) => {
    const duration = speed === 0 ? '0s' : `${Math.max(0.1, 1 / Math.abs(speed))}s`;
    const animationName = direction === 'sharp' ? 'strobe-spin-right' : 'strobe-spin-left';
    
    const style = {
        animation: speed === 0 ? 'none' : `${animationName} ${duration} linear infinite`,
    };

    return (
        <div className="w-full flex-1 min-h-[1.5rem] bg-zinc-800 border-y border-zinc-700 overflow-hidden relative my-1 last:mb-0">
            <div className="absolute inset-0 strobe-pattern opacity-50" style={style}></div>
            <div className="absolute top-0 bottom-0 left-1/2 w-1 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] z-10 -translate-x-1/2"></div>
        </div>
    );
};

const ChromaticNeedle = ({ cents }) => {
    const rotation = Math.max(-45, Math.min(45, cents));
    const isTuned = Math.abs(cents) < 3;
    const color = isTuned ? 'text-green-400' : 'text-red-400';
    
    return (
        <div className="relative w-full h-full max-h-[40vh] aspect-[2/1] flex justify-center items-end overflow-hidden">
            <div className="absolute bottom-0 w-full h-full border-t-2 border-zinc-600 rounded-t-full opacity-30"></div>
            <div className="absolute bottom-0 w-1 h-[15%] bg-zinc-500"></div>
            <div className="absolute bottom-0 w-1 h-[10%] bg-zinc-600 rotate-45 origin-bottom translate-x-[4rem] -translate-y-2"></div>
            <div className="absolute bottom-0 w-1 h-[10%] bg-zinc-600 -rotate-45 origin-bottom -translate-x-[4rem] -translate-y-2"></div>

            <div 
                className={`w-[1%] h-[85%] origin-bottom bg-current transition-transform duration-100 ease-linear shadow-[0_0_15px_currentColor] ${color}`}
                style={{ transform: `rotate(${rotation}deg)` }}
            ></div>
            <div className="absolute bottom-[-5%] w-[5%] aspect-square bg-zinc-200 rounded-full z-10"></div>
        </div>
    );
};

const PolyphonicDisplay = ({ detectedFreq, refFreq }) => {
    return (
        <div className="flex justify-between items-end w-full h-full px-2 gap-1 md:gap-2">
            {GUITAR_STRINGS.map((str, idx) => {
                const scaleFactor = refFreq / 440; 
                const targetFreq = str.freq * scaleFactor;
                const isActive = detectedFreq && Math.abs(detectedFreq - targetFreq) < 20; 
                let cents = 0;
                let isTuned = false;

                if (isActive) {
                    const semitones = 12 * (Math.log2(detectedFreq / targetFreq));
                    cents = semitones * 100;
                    isTuned = Math.abs(cents) < 5;
                }

                const transY = isActive ? Math.max(-45, Math.min(45, cents)) * -1 : 0;
                
                return (
                    <div key={idx} className={`flex flex-col items-center gap-1 w-full h-full transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-40'}`}>
                        <div className="flex-1 w-full bg-zinc-800 rounded-full relative flex items-center justify-center overflow-hidden">
                             <div 
                                className={`w-3 rounded-full transition-all duration-100 ${isTuned ? 'bg-green-500 h-3 w-full shadow-[0_0_10px_#22c55e]' : 'bg-red-500 h-1'}`}
                                style={{ transform: `translateY(${transY}px)` }}
                             ></div>
                             <div className="absolute w-full h-[1px] bg-white opacity-20"></div>
                        </div>
                        <span className="text-zinc-400 font-bold text-xs">{str.note}</span>
                    </div>
                );
            })}
        </div>
    );
};

// --- MAIN APP ---

const TunerApp = () => {
    const [mode, setMode] = useState('chromatic');
    const [refFreq, setRefFreq] = useState(440);
    const [keepAwake, setKeepAwake] = useState(false);
    const [isListening, setIsListening] = useState(false);
    
    const [tuningData, setTuningData] = useState({ 
        note: '--', 
        octave: '', 
        cents: 0, 
        frequency: 0 
    });

    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const micStreamRef = useRef(null);
    const requestRef = useRef(null);
    const wakeLockRef = useRef(null);
    const refFreqRef = useRef(440);

    useEffect(() => {
        refFreqRef.current = refFreq;
    }, [refFreq]);

    const requestWakeLock = useCallback(async () => {
        if ('wakeLock' in navigator) {
            try {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
                document.addEventListener('visibilitychange', handleVisibilityChange);
            } catch (err) {
                console.warn(err);
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

    const updatePitch = () => {
        if (!analyserRef.current) return;
        const buffer = new Float32Array(analyserRef.current.fftSize);
        analyserRef.current.getFloatTimeDomainData(buffer);
        const frequency = autoCorrelate(buffer, audioContextRef.current.sampleRate);

        if (frequency !== -1) {
            const currentRefFreq = refFreqRef.current;
            const noteNum = 12 * (Math.log(frequency / currentRefFreq) / Math.log(2)) + 69;
            const noteIndex = Math.round(noteNum);
            const noteName = NOTE_STRINGS[noteIndex % 12];
            const octave = Math.floor(noteIndex / 12) - 1;
            const perfectFreq = currentRefFreq * Math.pow(2, (noteIndex - 69) / 12);
            const cents = 1200 * Math.log2(frequency / perfectFreq);

            setTuningData({ note: noteName, octave: octave, cents: cents, frequency: frequency });
        }
        requestRef.current = requestAnimationFrame(updatePitch);
    };

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
            alert("Could not access microphone.");
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
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        setIsListening(false);
        setTuningData({ note: '--', octave: '', cents: 0, frequency: 0 });
    };

    const toggleMic = () => isListening ? stopMic() : startMic();

    const isSharp = tuningData.cents > 0;
    const strobeSpeed = (tuningData.cents / 50); 
    const stepButtonStyle = "flex-1 h-full min-h-[3rem] flex items-center justify-center bg-zinc-800 rounded-md text-zinc-400 hover:text-white active:scale-95 transition-all cursor-pointer select-none";

    // --- RENDER ---
    return (
        // Changed h-screen to h-[100dvh] for Safari mobile
        // Used landscape: prefixes instead of md: to force rotation layout
        <div className="flex flex-col landscape:flex-row w-full h-[100dvh] bg-zinc-950 overflow-hidden">
            
            {/* LEFT PANEL: Display */}
            <div className="flex-1 relative flex flex-col items-center justify-between bg-gradient-to-br from-black to-zinc-900 overflow-hidden p-4">
                
                {/* Note Info */}
                <div className="flex-1 flex flex-col items-center justify-center w-full min-h-0">
                    <div className="flex items-start font-black text-white tracking-tighter leading-none drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]" style={{ fontSize: 'min(25vh, 25vw)' }}>
                        {tuningData.note}
                        <span className="text-[0.4em] mt-[0.1em] text-zinc-500 font-normal ml-2">{tuningData.octave}</span>
                    </div>

                    <div className="flex flex-col items-center justify-center min-h-[4rem] mt-4">
                        {tuningData.note !== '--' ? (
                            <>
                                {/* Increased font size (text-4xl) */}
                                <div className={`text-3xl landscape:text-4xl font-mono font-bold ${Math.abs(tuningData.cents) < 3 ? 'text-green-500' : 'text-red-500'}`}>
                                    {tuningData.cents > 0 ? '+' : ''}{Math.floor(tuningData.cents)}
                                    <span className="text-lg ml-1 opacity-60">cents</span>
                                </div>
                                {/* Added Frequency display */}
                                <div className="text-2xl landscape:text-3xl font-mono text-zinc-500 mt-1">
                                    {tuningData.frequency.toFixed(1)} <span className="text-sm opacity-60">Hz</span>
                                </div>
                            </>
                        ) : (
                            <div className="text-zinc-600 font-mono animate-pulse">{isListening ? 'Listening...' : 'Mic Off'}</div>
                        )}
                    </div>
                </div>

                {/* Visualizer */}
                <div className="w-full h-[35%] flex flex-col items-center justify-center pb-2">
                    {mode === 'chromatic' && <ChromaticNeedle cents={tuningData.cents} />}
                    {mode === 'strobe' && (
                        <div className="w-full h-full flex flex-col justify-center opacity-90 gap-1">
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

            {/* RIGHT PANEL: Controls */}
            {/* Fixed width in landscape, auto in portrait */}
            <div className="flex-none w-full landscape:w-72 bg-zinc-900 border-t landscape:border-t-0 landscape:border-l border-zinc-800 p-4 flex flex-col gap-3 shadow-xl z-20">
                
                <div className="grid grid-cols-2 landscape:grid-cols-1 gap-3">
                    
                    {/* Mode */}
                    <div className="col-span-2 landscape:col-span-1 flex flex-col gap-1">
                        <label className="text-zinc-500 text-[10px] uppercase font-bold">Mode</label>
                        <div className="bg-zinc-950 p-1 rounded-lg border border-zinc-800 flex flex-row landscape:flex-col gap-1">
                            {['chromatic', 'polyphonic', 'strobe'].map((m) => (
                                <button
                                    key={m}
                                    onClick={() => setMode(m)}
                                    className={`flex-1 landscape:flex-none text-center landscape:text-left px-2 py-2 landscape:py-3 rounded-md text-xs landscape:text-sm font-medium transition-all flex items-center justify-center landscape:justify-between ${
                                        mode === m 
                                        ? 'bg-zinc-800 text-white shadow-md border border-zinc-700' 
                                        : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                                >
                                    <span className="capitalize hidden landscape:inline">{m}</span>
                                    <span className="capitalize landscape:hidden">{m.slice(0,4)}</span>
                                    <div className={`hidden landscape:block w-2 h-2 rounded-full ${mode === m ? 'bg-blue-500' : 'bg-zinc-700'}`}></div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Ref Pitch */}
                    <div className="col-span-1 flex flex-col gap-1">
                        <label className="text-zinc-500 text-[10px] uppercase font-bold">Ref Pitch</label>
                        <div className="flex items-center justify-between bg-zinc-950 rounded-lg border border-zinc-800 p-1 h-12">
                            <button onClick={() => setRefFreq(r => r - 1)} className={stepButtonStyle}>-</button>
                            <input 
                                type="number" 
                                value={refFreq}
                                onChange={(e) => setRefFreq(parseInt(e.target.value) || 440)}
                                className="w-full bg-transparent text-center text-lg font-mono text-white focus:outline-none appearance-none border-none m-0 p-0"
                            />
                            <button onClick={() => setRefFreq(r => r + 1)} className={stepButtonStyle}>+</button>
                        </div>
                    </div>

                    {/* Screen Lock */}
                    <div className="col-span-1 flex flex-col gap-1">
                        <label className="text-zinc-500 text-[10px] uppercase font-bold">Screen</label>
                        <button 
                            onClick={() => setKeepAwake(!keepAwake)}
                            className="h-12 w-full flex items-center justify-between px-3 bg-zinc-950 rounded-lg border border-zinc-800"
                        >
                            <span className="text-xs text-zinc-400">Keep On</span>
                            <div className={`w-8 h-4 rounded-full relative transition-colors duration-300 ${keepAwake ? 'bg-blue-600' : 'bg-zinc-700'}`}>
                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-300 shadow-md ${keepAwake ? 'translate-x-4' : 'translate-x-0'}`}></div>
                            </div>
                        </button>
                    </div>
                </div>

                <div className="mt-auto pt-2 landscape:pt-4 border-t border-zinc-800">
                    <button 
                        onClick={toggleMic}
                        className={`w-full flex items-center justify-center gap-2 py-3 rounded-md font-bold text-sm transition-all ${
                            isListening 
                            ? 'bg-red-900/30 text-red-200 border border-red-900 hover:bg-red-900/50' 
                            : 'bg-green-900/30 text-green-200 border border-green-900 hover:bg-green-900/50'
                        }`}
                    >
                        <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
                        {isListening ? 'STOP' : 'START'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<TunerApp />);