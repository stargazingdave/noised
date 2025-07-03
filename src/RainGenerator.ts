import { OscParam } from "./types/OscParam";

export type NoiseType = 'pink' | 'white';

export interface RainParams {
    volume: number;
    eqGains: number[];

    noiseLevel: number;
    noiseType: NoiseType;
    noiseFilterFreq: OscParam;

    dropDryLevel: number;
    dropWetLevel: number;
    dropRate: number;
    dropMinPitch: OscParam;
    dropMaxPitch: OscParam;
    dropDecayTime: number;
    dropReverbLevel: OscParam;
    dropPanRange: OscParam;
    dropQ: number;
}

export const _defaultRainParams: RainParams = {
    volume: 0.5,
    noiseLevel: 0.2,
    noiseType: 'pink',
    noiseFilterFreq: { value: 4000, osc: false, amp: 1000, freq: 0.1 },
    eqGains: new Array(10).fill(0),
    dropDryLevel: 0.5,
    dropWetLevel: 0.5,
    dropRate: 30,
    dropMinPitch: { value: 300, osc: false, amp: 100, freq: 0.1 },
    dropMaxPitch: { value: 800, osc: false, amp: 500, freq: 0.1 },
    dropDecayTime: 0.2,
    dropReverbLevel: { value: 0.4, osc: false, amp: 0.2, freq: 0.1 },
    dropPanRange: { value: 1.0, osc: false, amp: 0.5, freq: 0.1 },
    dropQ: 1,
};

export class RainGenerator<T extends BaseAudioContext = AudioContext> {
    private audioCtx: T;
    private output: GainNode;
    private noiseGainNode: GainNode;
    private dropGainNode: GainNode;
    private dryDropGainNode: GainNode;
    private reverbNode: ConvolverNode;
    private dryGain: GainNode;
    private wetGain: GainNode;
    private noiseFilter: BiquadFilterNode;
    private noiseNode: AudioBufferSourceNode | null;
    private dropInterval: ReturnType<typeof setInterval> | null;
    private running: boolean;
    private params: RainParams;
    private eqBands: BiquadFilterNode[];
    private lfoMap: Map<string, { osc: OscillatorNode; gain: GainNode }>;
    private readonly eqFrequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

    constructor(audioCtx: T, params?: Partial<RainParams>) {
        this.audioCtx = audioCtx;
        this.output = this.audioCtx.createGain();
        this.noiseGainNode = this.audioCtx.createGain();
        this.noiseFilter = this.audioCtx.createBiquadFilter();
        this.noiseFilter.type = 'lowpass';

        this.dropGainNode = this.audioCtx.createGain();
        this.dryDropGainNode = this.audioCtx.createGain();
        this.reverbNode = this.audioCtx.createConvolver();
        this.dryGain = this.audioCtx.createGain();
        this.wetGain = this.audioCtx.createGain();
        this.noiseNode = null;
        this.dropInterval = null;
        this.running = false;
        this.lfoMap = new Map();

        this.params = { ..._defaultRainParams, ...params };

        this.eqBands = this.eqFrequencies.map(freq => {
            const band = this.audioCtx.createBiquadFilter();
            band.type = 'peaking';
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

        this._connectNodes();
        this._generateImpulseResponse();
    }

    public destroy() {
        this.stop(); // Ensure everything is silenced and stopped

        // Disconnect all nodes that are part of the audio graph
        this.output.disconnect();
        this.noiseGainNode.disconnect();
        this.noiseFilter.disconnect();
        this.dropGainNode.disconnect();
        this.dryDropGainNode.disconnect();
        this.reverbNode.disconnect();
        this.dryGain.disconnect();
        this.wetGain.disconnect();

        // Disconnect each EQ band
        this.eqBands.forEach((band) => band.disconnect());

        // Clear all LFOs
        this.lfoMap.forEach(({ osc, gain }) => {
            osc.disconnect();
            gain.disconnect();
        });
        this.lfoMap.clear();

        // Null references (optional, helps GC and safety)
        this.noiseNode = null;
        this.dropInterval = null;
    }

    private _connectNodes() {
        this.noiseGainNode.connect(this.noiseFilter);
        this.noiseFilter.connect(this.dryGain);

        this.dropGainNode.connect(this.reverbNode);
        this.reverbNode.connect(this.wetGain);

        this.dryDropGainNode.connect(this.eqBands[0]);
        this.dryGain.connect(this.eqBands[0]);
        this.wetGain.connect(this.eqBands[0]);
    }

    private _generateImpulseResponse() {
        const length = this.audioCtx.sampleRate * 2;
        const impulse = this.audioCtx.createBuffer(2, length, this.audioCtx.sampleRate);
        for (let channel = 0; channel < 2; channel++) {
            const data = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
            }
        }
        this.reverbNode.buffer = impulse;
    }

    private setOscParam(param: OscParam, target: AudioParam, id: string) {
        const now = this.audioCtx.currentTime;

        const prev = this.lfoMap.get(id);
        if (prev) {
            prev.osc.stop();
            prev.osc.disconnect();
            prev.gain.disconnect();
            this.lfoMap.delete(id);
        }

        target.cancelScheduledValues(now);
        target.setValueAtTime(param.value, now);

        if (this.running && param.osc) {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = param.freq;
            gain.gain.value = param.amp;

            osc.connect(gain);
            gain.connect(target);
            osc.start();

            this.lfoMap.set(id, { osc, gain });
        }
    }

    public async start() {
        if (this.running) return;

        if (this.audioCtx instanceof AudioContext && this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }

        this.running = true;
        const now = this.audioCtx.currentTime;

        // Set gain levels
        this.output.gain.setValueAtTime(this.params.volume, now);
        this.noiseGainNode.gain.setValueAtTime(this.params.volume * 0.4, now);
        this.dropGainNode.gain.setValueAtTime(this.params.dropWetLevel, now);
        this.dryDropGainNode.gain.setValueAtTime(this.params.dropDryLevel, now);
        this.dryGain.gain.setValueAtTime(this.params.noiseLevel, now);
        this.wetGain.gain.setValueAtTime(this.params.dropReverbLevel.value, now);

        // Set all parameters (in order!)
        this.setNoiseType(this.params.noiseType); // ✅ this will start noise
        this.setNoiseFilterFreq(this.params.noiseFilterFreq);
        this.setDropReverbLevel(this.params.dropReverbLevel);
        this.setDropRate(this.params.dropRate);
        this.setPanRange(this.params.dropPanRange);

        this._startDrops();
    }

    public stop() {
        this.running = false;

        // Stop and disconnect the noise node
        if (this.noiseNode) {
            this.noiseNode.stop();
            this.noiseNode.disconnect();
            this.noiseNode = null;
        }

        // Clear the drop interval
        if (this.dropInterval) {
            clearInterval(this.dropInterval);
            this.dropInterval = null;
        }

        // Stop and disconnect all LFOs
        this.lfoMap.forEach(({ osc, gain }) => {
            osc.stop();
            osc.disconnect();
            gain.disconnect();
        });
        this.lfoMap.clear();

        // Reset all gain nodes to zero to silence the audio
        const now = this.audioCtx.currentTime;
        this.output.gain.setValueAtTime(0, now);
        this.noiseGainNode.gain.setValueAtTime(0, now);
        this.dropGainNode.gain.setValueAtTime(0, now);
        this.dryDropGainNode.gain.setValueAtTime(0, now);
        this.dryGain.gain.setValueAtTime(0, now);
        this.wetGain.gain.setValueAtTime(0, now);
    }

    public setNoiseFilterFreq(param: OscParam) {
        this.params.noiseFilterFreq = param;
        this.setOscParam(param, this.noiseFilter.frequency, 'noiseFilterFreq');
    }

    public setDropReverbLevel(param: OscParam) {
        this.params.dropReverbLevel = param;
        this.setOscParam(param, this.wetGain.gain, 'dropReverbLevel');
    }

    public setDropRate(param: number) {
        this.params.dropRate = param;
        if (this.dropInterval) clearInterval(this.dropInterval);
        if (this.running) this._startDrops();
    }

    public setPanRange(param: OscParam) {
        this.params.dropPanRange = param;
    }

    public setPitchRange(min: OscParam, max: OscParam) {
        this.params.dropMinPitch = min;
        this.params.dropMaxPitch = max;
    }

    public setDecayTime(param: number) {
        this.params.dropDecayTime = param;
    }

    public setNoiseLevel(value: number) {
        this.dryGain.gain.value = value;
    }

    public setDropDryLevel(value: number) {
        this.dryDropGainNode.gain.value = value;
    }

    public setDropWetLevel(value: number) {
        this.dropGainNode.gain.value = value;
    }

    public setDropQ(value: number) {
        this.params.dropQ = value;
    }

    public setVolume(value: number) {
        this.output.gain.value = value;
    }

    public setNoiseType(type: NoiseType) {
        this.params.noiseType = type;

        if (this.running) {
            this._startNoise(); // ✅ no conditions — always run
        }
    }

    public setParams(newParams: Partial<RainParams>) {
        this._applyParams(newParams);
    }

    private _applyParams(newParams: Partial<RainParams>) {
        const updated = { ...this.params, ...newParams };
        if (newParams.eqGains?.length === this.eqBands.length) {
            newParams.eqGains.forEach((gain, i) => {
                this.eqBands[i].gain.value = gain;
            });
        }
        this.params = updated;
    }

    private _startNoise() {
        if (this.noiseNode) {
            this.noiseNode.stop();
            this.noiseNode.disconnect();
            this.noiseNode = null;
        }

        const bufferSize = 2 * this.audioCtx.sampleRate;
        const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);

        if (this.params.noiseType === 'white') {
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }
        } else {
            // Pink noise
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.969 * b2 + white * 0.153852;
                b3 = 0.8665 * b3 + white * 0.3104856;
                b4 = 0.55 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.016898;
                output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                output[i] *= 0.11;
                b6 = white * 0.115926;
            }
        }

        this.noiseNode = this.audioCtx.createBufferSource();
        this.noiseNode.buffer = noiseBuffer;
        this.noiseNode.loop = true;
        this.noiseNode.connect(this.noiseGainNode); // ✅ must be connected
        this.noiseNode.start();
    }

    private _startDrops() {
        const playDrop = () => {
            const now = this.audioCtx.currentTime;
            const duration = Math.min(this.params.dropDecayTime, 0.2);
            const buffer = this.audioCtx.createBuffer(1, this.audioCtx.sampleRate * duration, this.audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) {
                const fade = Math.pow(1 - i / data.length, 2.5);
                data[i] = (Math.random() * 2 - 1) * fade;
            }
            const drop = this.audioCtx.createBufferSource();
            drop.buffer = buffer;

            const filter = this.audioCtx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = this.params.dropMinPitch.value + Math.random() * (this.params.dropMaxPitch.value - this.params.dropMinPitch.value);
            filter.Q.value = this.params.dropQ;

            const pan = this.audioCtx.createStereoPanner();
            pan.pan.value = (Math.random() * 2 - 1) * this.params.dropPanRange.value;

            const dryGain = this.audioCtx.createGain();
            dryGain.gain.value = this.params.dropDryLevel;

            drop.connect(filter);
            filter.connect(pan);
            pan.connect(this.dropGainNode);
            pan.connect(dryGain);
            dryGain.connect(this.dryDropGainNode);

            drop.start(now);
        };

        const baseRate = this.params.dropRate;
        const baseInterval = 1000 / baseRate;

        this.dropInterval = setInterval(playDrop, baseInterval);
    }

    public connect(node: AudioNode) {
        this.output.connect(node);
    }

    public disconnect() {
        this.output.disconnect();
    }
}
