import { RainGenerator, RainParams, _defaultRainParams } from "./RainGenerator";
import { ThunderGenerator, ThunderParams, _defaultThunderParams } from "./ThunderGenerator";
import { OscParam } from "./types/OscParam";

export type Range<T = number> = {
    min: T;
    max: T;
};

export interface NoiseDParams {
    masterVolume: number;
    delayBetweenThunders: Range<number>;
    eqGains: number[];
    rainParams: RainParams & { on: boolean };
    thunderParams: ThunderParams & { on: boolean };
}

export const _defaultNoiseDParams: NoiseDParams = {
    masterVolume: 0.5,
    delayBetweenThunders: { min: 5000, max: 15000 },
    eqGains: new Array(10).fill(0),
    rainParams: { ..._defaultRainParams, on: true },
    thunderParams: { ..._defaultThunderParams, on: true },
};

export class NoiseDController<T extends BaseAudioContext = AudioContext> {
    private ctx: T;
    private rain: RainGenerator<T>;
    private thunder: ThunderGenerator<T>;
    private masterGain: GainNode;
    private eqBands: BiquadFilterNode[] = [];
    private readonly eqFrequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    private params: NoiseDParams;
    private thunderTimeout: number | null = null;
    private running = false;

    constructor(ctx: T, params: Partial<NoiseDParams> = {}) {
        this.ctx = ctx;
        this.params = { ..._defaultNoiseDParams, ...params };
        this.masterGain = this.ctx.createGain();
        this.rain = new RainGenerator(this.ctx, this.params.rainParams);
        this.thunder = new ThunderGenerator(this.ctx, this.params.thunderParams);
        // Create and chain EQ
        this.eqBands = this.eqFrequencies.map(freq => {
            const band = this.ctx.createBiquadFilter();
            band.type = "peaking";
            band.frequency.value = freq;
            band.Q.value = 1.0;
            band.gain.value = 0;
            return band;
        });

        // Chain them in order
        let last = this.eqBands[0];
        for (let i = 1; i < this.eqBands.length; i++) {
            last.connect(this.eqBands[i]);
            last = this.eqBands[i];
        }

        // Now connect rain/thunder → EQ → master
        this.rain.connect(this.eqBands[0]);
        this.thunder.connect(this.eqBands[0]);
        last.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
        this._applyParams();
    }

    public destroy() {
        this.stop();

        // Disconnect and null out all EQ bands
        this.eqBands.forEach((band) => band.disconnect());
        this.eqBands = [];

        // Disconnect master gain
        this.masterGain.disconnect();

        // Destroy sub-generators
        this.rain.destroy();
        this.thunder.destroy();

        // Null references for safety
        this.thunderTimeout = null;
    }

    public start() {
        if (this.running) return;
        this.running = true;

        if (this.params.rainParams.on) {
            this.rain.start();
        }

        if (this.params.thunderParams.on) {
            this.scheduleThunder();
        }
    }

    public stop() {
        this.running = false;
        this.rain.stop();
        if (this.thunderTimeout) {
            clearTimeout(this.thunderTimeout);
            this.thunderTimeout = null;
        }
    }

    public startRain() {
        this.params.rainParams.on = true;
        this.rain.start();
    }

    public stopRain() {
        this.params.rainParams.on = false;
        this.rain.stop();
    }

    public startThunder() {
        this.params.thunderParams.on = true;
        this.scheduleThunder();
    }

    public stopThunder() {
        this.params.thunderParams.on = false;
        if (this.thunderTimeout) {
            clearTimeout(this.thunderTimeout);
            this.thunderTimeout = null;
        }
    }

    public setMasterVolume(value: number) {
        this.params.masterVolume = value;
        this.masterGain.gain.setValueAtTime(value, this.ctx.currentTime);
    }

    public setDelayBetweenThunders(value: Range<number>) {
        this.params.delayBetweenThunders = value;
    }

    public setEqGain(index: number, value: number) {
        if (index < 0 || index >= this.eqBands.length) return;
        this.params.eqGains[index] = value;
        this.eqBands[index].gain.setValueAtTime(value, this.ctx.currentTime);
    }

    public updateRainParams(newRainParams: Partial<RainParams>) {
        this.params.rainParams = { ...this.params.rainParams, ...newRainParams };
        this.rain.setParams(this.params.rainParams);
    }

    public updateThunderParams(newThunderParams: Partial<ThunderParams>) {
        this.params.thunderParams = { ...this.params.thunderParams, ...newThunderParams };
        this.thunder.setParams(this.params.thunderParams);
    }

    private _applyParams() {
        this.setMasterVolume(this.params.masterVolume);
        if (this.params.eqGains.length === this.eqBands.length) {
            this.params.eqGains.forEach((gain, i) => {
                this.eqBands[i].gain.setValueAtTime(gain, this.ctx.currentTime);
            });
        }
        this.rain.setParams(this.params.rainParams);
        this.thunder.setParams(this.params.thunderParams);
    }

    private scheduleThunder() {
        if (!this.running || !this.params.thunderParams.on) return;

        const delay = this._rand(this.params.delayBetweenThunders.min, this.params.delayBetweenThunders.max);
        this.thunderTimeout = window.setTimeout(() => {
            this.thunder.triggerThunder();
            this.scheduleThunder(); // loop
        }, delay);
    }

    private _rand(min: number, max: number) {
        return Math.random() * (max - min) + min;
    }

    public async renderToFile(durationSec: number): Promise<Blob> {
        const sampleRate = this.ctx.sampleRate;
        const offlineCtx = new OfflineAudioContext(2, durationSec * sampleRate, sampleRate);
        const controller = new NoiseDController(offlineCtx, this.params);
        controller.start();

        await offlineCtx.startRendering();
        const buffer = await offlineCtx.startRendering();

        const wavBlob = await this._bufferToWavBlob(buffer);
        return wavBlob;
    }

    private async _bufferToWavBlob(buffer: AudioBuffer): Promise<Blob> {
        const numOfChan = buffer.numberOfChannels;
        const length = buffer.length * numOfChan * 2 + 44;
        const bufferArray = new ArrayBuffer(length);
        const view = new DataView(bufferArray);

        let offset = 0;

        const writeString = (s: string) => {
            for (let i = 0; i < s.length; i++) {
                view.setUint8(offset++, s.charCodeAt(i));
            }
        };

        const writeUint32 = (v: number) => {
            view.setUint32(offset, v, true);
            offset += 4;
        };

        const writeUint16 = (v: number) => {
            view.setUint16(offset, v, true);
            offset += 2;
        };

        writeString("RIFF");
        writeUint32(length - 8);
        writeString("WAVE");
        writeString("fmt ");
        writeUint32(16);
        writeUint16(1);
        writeUint16(numOfChan);
        writeUint32(buffer.sampleRate);
        writeUint32(buffer.sampleRate * numOfChan * 2);
        writeUint16(numOfChan * 2);
        writeUint16(16);
        writeString("data");
        writeUint32(length - offset - 4);

        const interleaved = new Float32Array(buffer.length * numOfChan);
        for (let ch = 0; ch < numOfChan; ch++) {
            buffer.copyFromChannel(interleaved.subarray(ch, interleaved.length), ch);
        }

        const output = new Int16Array(interleaved.length);
        for (let i = 0; i < interleaved.length; i++) {
            const s = Math.max(-1, Math.min(1, interleaved[i]));
            output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        new Uint8Array(bufferArray, offset).set(new Uint8Array(output.buffer));
        return new Blob([bufferArray], { type: "audio/wav" });
    }

    public setRainVolume(value: number) {
        this.params.rainParams.volume = value;
        this.rain.setVolume(value);
    }

    public setRainNoiseType(value: 'pink' | 'white') {
        this.params.rainParams.noiseType = value;
        this.rain.setNoiseType(value);
    }

    public setRainNoiseLevel(value: number) {
        this.params.rainParams.noiseLevel = value;
        this.rain.setNoiseLevel(value);
    }

    public setRainDropDryLevel(value: number) {
        this.params.rainParams.dropDryLevel = value;
        this.rain.setDropDryLevel(value);
    }

    public setRainDropWetLevel(value: number) {
        this.params.rainParams.dropWetLevel = value;
        this.rain.setDropWetLevel(value);
    }
    public setRainDropPanRange(value: OscParam) {
        this.params.rainParams.dropPanRange = value;
        this.rain.setPanRange(value);
    }
    public setRainDropQ(value: number) {
        this.params.rainParams.dropQ = value;
        this.rain.setDropQ(value);
    }
    public setRainDropMinPitch(value: OscParam) {
        this.params.rainParams.dropMinPitch = value;
        this.rain.setPitchRange(value, this.params.rainParams.dropMaxPitch);
    }
    public setRainDropMaxPitch(value: OscParam) {
        this.params.rainParams.dropMaxPitch = value;
        this.rain.setPitchRange(this.params.rainParams.dropMinPitch, value);
    }
    public setRainDropDecayTime(value: number) {
        this.params.rainParams.dropDecayTime = value;
        this.rain.setDecayTime(value);
    }
    public setRainDropRate(value: number) {
        this.params.rainParams.dropRate = value;
        this.rain.setDropRate(value);
    }
    public setRainDropReverbLevel(value: OscParam) {
        this.params.rainParams.dropReverbLevel = value;
        this.rain.setDropReverbLevel(value);
    }
    public setRainNoiseFilterFreq(value: OscParam) {
        this.params.rainParams.noiseFilterFreq = value;
        this.rain.setNoiseFilterFreq(value);
    }
    public setRainEqGain(index: number, value: number) {
        const newRainParams = {
            ...this.params.rainParams,
            eqGains: this.params.rainParams.eqGains.map((gain, i) => (i === index ? value : gain)),
        }
        this.params.rainParams = newRainParams;
        this.rain.setParams(newRainParams);
    }

    public setThunderParams(newParams: Partial<ThunderParams>) {
        this.thunder.setParams(newParams);
        this.params.thunderParams = { ...this.params.thunderParams, ...newParams };
        if (newParams.reverbDuration || newParams.reverbDecay) {
            this.thunder.setGeneratedReverb();
        }
    }

    public exportParamsAsJSON(): string {
        return JSON.stringify(this.params, null, 2);
    }

    public getAnalyser(): AnalyserNode {
        const analyser = this.ctx.createAnalyser();
        this.masterGain.connect(analyser); // tap into the master output
        return analyser;
    }
}
