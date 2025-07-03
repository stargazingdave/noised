import { createImpulseResponse } from "./functions/createImpulseResponse";
import { RandParam } from "./types/RandParam";
export type ThunderParamsLimits = Record<keyof ThunderParams, { min: number; max: number }>;

export interface ThunderParams {
    volume: RandParam;
    duration: RandParam;
    filterFreq: RandParam;
    burstCount: RandParam;
    delayMs: number;
    reverbDuration: RandParam;
    reverbDecay: RandParam;
    reverbWetLevel: RandParam;
    subLevel: RandParam;
    panRange: RandParam;
    highPassFreq: RandParam;
    crackleAmount: RandParam;
    eqGains: number[];
    rumbleFreqStart: RandParam;
    rumbleFreqEnd: RandParam;
    rumbleVolume: RandParam;
    rumbleDecay: RandParam;
}

export const _defaultThunderParams: ThunderParams = {
    volume: {
        value: 0.5,
        rand: false,
        dist: 0.2
    },
    duration: {
        value: 2,
        rand: false,
        dist: 0.2
    },
    filterFreq: {
        value: 750,
        rand: false,
        dist: 500
    },
    burstCount: {
        value: 3,
        rand: false,
        dist: 1
    },
    delayMs: 0,
    reverbDuration: {
        value: 2,
        rand: false,
        dist: 0.5
    },
    reverbDecay: {
        value: 2,
        rand: false,
        dist: 0.5
    },
    reverbWetLevel: {
        value: 0.4,
        rand: false,
        dist: 0.2
    },
    subLevel: {
        value: 0.1,
        rand: false,
        dist: 0.1
    },
    panRange: {
        value: 1,
        rand: false,
        dist: 0.5
    },
    highPassFreq: {
        value: 20,
        rand: false,
        dist: 5
    },
    crackleAmount: {
        value: 1,
        rand: false,
        dist: 0.5
    },
    eqGains: new Array(10).fill(0),
    rumbleFreqStart: {
        value: 30,
        rand: false,
        dist: 5
    },
    rumbleFreqEnd: {
        value: 20,
        rand: false,
        dist: 5
    },
    rumbleVolume: {
        value: 0.05,
        rand: false,
        dist: 0.1
    },
    rumbleDecay: {
        value: 8,
        rand: false,
        dist: 2
    }
}

export class ThunderGenerator<T extends BaseAudioContext = AudioContext> {
    private ctx: T;
    private reverbBuffer: AudioBuffer | null = null;
    private output: GainNode;
    private limiter: DynamicsCompressorNode;
    private params: ThunderParams;
    private eqBands: BiquadFilterNode[] = [];
    private readonly eqFrequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

    constructor(audioCtx: T, params?: Partial<ThunderParams>) {
        this.ctx = audioCtx;
        this.params = { ..._defaultThunderParams, ...params };

        this.output = this.ctx.createGain();

        this.limiter = this.ctx.createDynamicsCompressor();
        this.limiter.threshold.setValueAtTime(-6, this.ctx.currentTime);
        this.limiter.knee.setValueAtTime(30, this.ctx.currentTime);
        this.limiter.ratio.setValueAtTime(12, this.ctx.currentTime);
        this.limiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
        this.limiter.release.setValueAtTime(0.25, this.ctx.currentTime);

        this.eqBands = this.eqFrequencies.map(freq => {
            const band = this.ctx.createBiquadFilter();
            band.type = "peaking";
            band.frequency.value = freq;
            band.Q.value = 1.0;
            band.gain.value = 0;
            return band;
        });

        let last = this.eqBands[0];
        for (let i = 1; i < this.eqBands.length; i++) {
            last.connect(this.eqBands[i]);
            last = this.eqBands[i];
        }
        last.connect(this.output);
        this.output.connect(this.limiter);
    }

    public destroy() {
        // Disconnect output and limiter
        this.output.disconnect();
        this.limiter.disconnect();

        // Disconnect EQ bands
        this.eqBands.forEach((band) => band.disconnect());

        // Clear reverb buffer reference (optional, helps GC)
        this.reverbBuffer = null;

        // Optional: If you're calling `triggerThunder()` repeatedly via setInterval somewhere,
        // make sure to clear that interval outside or track and cancel it here.

        // No scheduled `OscillatorNode`/`BufferSourceNode` references stored in fields,
        // so the dynamically created nodes (osc, rumbleOsc, noise, brown, etc.)
        // should be cleaned up after `stop()` and GC — nothing more to disconnect here.

        // Clear params if you want to reset
        // this.params = { ..._defaultThunderParams }; // Optional
    }

    setGeneratedReverb() {
        const duration = this.params.reverbDuration?.value
            ? this.params.reverbDuration.rand
                ? this.params.reverbDuration.value + (Math.random() * this.params.reverbDuration.dist)
                : this.params.reverbDuration.value
            : 2;

        const decay = this.params.reverbDecay?.value
            ? this.params.reverbDecay.rand
                ? this.params.reverbDecay.value + (Math.random() * this.params.reverbDecay.dist)
                : this.params.reverbDecay.value
            : 2;

        this.reverbBuffer = createImpulseResponse(
            this.ctx,
            duration,
            decay
        );
    }

    triggerThunder() {
        const delay = this.params.delayMs ?? 0;
        const rumbleFreqStart = this.params.rumbleFreqStart?.value
            ? this.params.rumbleFreqStart.rand
                ? this.params.rumbleFreqStart.value + (Math.random() * this.params.rumbleFreqStart.dist)
                : this.params.rumbleFreqStart.value
            : 30;
        const rumbleFreqEnd = this.params.rumbleFreqEnd?.value
            ? this.params.rumbleFreqEnd.rand
                ? this.params.rumbleFreqEnd.value + (Math.random() * this.params.rumbleFreqEnd.dist)
                : this.params.rumbleFreqEnd.value
            : 20;
        const rumbleVolume = this.params.rumbleVolume?.value
            ? this.params.rumbleVolume.rand
                ? this.params.rumbleVolume.value + (Math.random() * this.params.rumbleVolume.dist)
                : this.params.rumbleVolume.value
            : 0.2;
        const rumbleDecay = this.params.rumbleDecay?.value
            ? this.params.rumbleDecay.rand
                ? this.params.rumbleDecay.value + (Math.random() * this.params.rumbleDecay.dist)
                : this.params.rumbleDecay.value
            : 8;
        const burstCount = this.params.burstCount?.value
            ? this.params.burstCount.rand
                ? this.params.burstCount.value + (Math.random() * this.params.burstCount.dist)
                : this.params.burstCount.value
            : 1;
        const duration = this.params.duration?.value
            ? this.params.duration.rand
                ? this.params.duration.value + (Math.random() * this.params.duration.dist)
                : this.params.duration.value
            : 2;
        const volume = this.params.volume?.value
            ? this.params.volume.rand
                ? this.params.volume.value + (Math.random() * this.params.volume.dist)
                : this.params.volume.value
            : 0.5;

        setTimeout(() => {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(rumbleFreqStart, now);
            osc.frequency.linearRampToValueAtTime(rumbleFreqEnd, now + rumbleDecay);
            gain.gain.setValueAtTime(rumbleVolume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + rumbleDecay);
            osc.connect(gain).connect(this.eqBands[0]);
            osc.start();
            osc.stop(now + rumbleDecay);

            for (let i = 0; i < burstCount; i++) {
                const burstDelay = 200 + Math.random() * 400;
                setTimeout(() => this._playSingleBurst(
                    duration * (0.8 + Math.random() * 0.4),
                    volume * (0.7 + Math.random() * 0.6)
                ), burstDelay * i);
            }
        }, delay);
    }

    setParams(newParams: Partial<ThunderParams>) {
        this._applyParams(newParams);
    }

    private _applyParams(newParams: Partial<ThunderParams>) {
        const updated = { ...this.params, ...newParams };

        if (newParams.eqGains && newParams.eqGains.length === this.eqBands.length) {
            newParams.eqGains.forEach((gain, i) => {
                this.eqBands[i].gain.value = gain;
            });
        }

        this.params = updated;
    }

    private _playSingleBurst(duration: number, volume: number) {
        const filterFreq = this.params.filterFreq?.value
            ? this.params.filterFreq.rand
                ? this.params.filterFreq.value + (Math.random() * this.params.filterFreq.dist)
                : this.params.filterFreq.value
            : 1500;
        const highPassFreq = this.params.highPassFreq?.value
            ? this.params.highPassFreq.rand
                ? this.params.highPassFreq.value + (Math.random() * this.params.highPassFreq.dist)
                : this.params.highPassFreq.value
            : 10;
        const panRange = this.params.panRange?.value
            ? this.params.panRange.rand
                ? this.params.panRange.value + (Math.random() * this.params.panRange.dist)
                : this.params.panRange.value
            : 1;
        const reverbWetLevel = this.params.reverbWetLevel?.value
            ? this.params.reverbWetLevel.rand
                ? this.params.reverbWetLevel.value + (Math.random() * this.params.reverbWetLevel.dist)
                : this.params.reverbWetLevel.value
            : 0.4;
        const subLevel = this.params.subLevel?.value
            ? this.params.subLevel.rand
                ? this.params.subLevel.value + (Math.random() * this.params.subLevel.dist)
                : this.params.subLevel.value
            : 0.1;
        const crackleAmount = this.params.crackleAmount?.value
            ? this.params.crackleAmount.rand
                ? this.params.crackleAmount.value + (Math.random() * this.params.crackleAmount.dist)
                : this.params.crackleAmount.value
            : 1;

        const now = this.ctx.currentTime;
        const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * duration, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < data.length; i++) {
            const buildUp = Math.min(1, i / (this.ctx.sampleRate * (duration * 0.25)));
            const decay = Math.exp(-i / (this.ctx.sampleRate * duration));
            const noise = (Math.random() * 2 - 1) * Math.pow(Math.random(), 2);
            data[i] = noise * decay * buildUp;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const lowpass = this.ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(filterFreq, now);
        lowpass.frequency.exponentialRampToValueAtTime(100, now + duration);

        const highpass = this.ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = highPassFreq;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(volume * 0.8, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(volume * 0.5, now + duration * 0.9);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration * 3);

        const pan = this.ctx.createStereoPanner();
        const basePan = (Math.random() * 2 - 1) * (panRange * 0.3);
        pan.pan.setValueAtTime(basePan, now);
        pan.pan.linearRampToValueAtTime(-basePan, now + duration);

        noise.connect(lowpass).connect(highpass).connect(gain).connect(pan).connect(this.eqBands[0]);

        if (this.reverbBuffer) {
            const convolver = this.ctx.createConvolver();
            convolver.buffer = this.reverbBuffer;
            const preVerbFilter = this.ctx.createBiquadFilter();
            preVerbFilter.type = "highpass";
            preVerbFilter.frequency.value = 80;

            const wetGain = this.ctx.createGain();
            wetGain.gain.value = reverbWetLevel;

            gain.connect(preVerbFilter).connect(convolver).connect(wetGain).connect(this.eqBands[0]);
        }

        const rumbleOsc = this.ctx.createOscillator();
        rumbleOsc.type = "sine";
        rumbleOsc.frequency.setValueAtTime(25, now);
        rumbleOsc.frequency.linearRampToValueAtTime(15, now + duration);

        const subGain = this.ctx.createGain();
        subGain.gain.setValueAtTime(subLevel * volume * 0.6, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 2.5);

        rumbleOsc.connect(subGain).connect(this.eqBands[0]);
        rumbleOsc.start();
        rumbleOsc.stop(now + duration * 2.5);

        const tailBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * duration * 1.5, this.ctx.sampleRate);
        const tailData = tailBuffer.getChannelData(0);
        let lastOut = 0;
        for (let i = 0; i < tailData.length; i++) {
            const white = Math.random() * 2 - 1;
            lastOut = (lastOut + 0.02 * white * crackleAmount) / (1.02 + crackleAmount * 0.05);
            tailData[i] = lastOut * 1.5 * Math.exp(-i / (this.ctx.sampleRate * duration));
        }

        const brown = this.ctx.createBufferSource();
        brown.buffer = tailBuffer;

        const brownHighPass = this.ctx.createBiquadFilter();
        brownHighPass.type = "highpass";
        brownHighPass.frequency.value = 30;

        const brownLowpass = this.ctx.createBiquadFilter();
        brownLowpass.type = "lowpass";
        brownLowpass.frequency.value = 1500;

        const brownGain = this.ctx.createGain();
        brownGain.gain.setValueAtTime(volume * 0.6, now);
        brownGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 2.5);

        brown.connect(brownHighPass).connect(brownLowpass).connect(brownGain).connect(this.eqBands[0]);

        noise.start();
        brown.start();
    }

    public connect(node: AudioNode) {
        this.output.connect(node);
    }
}
