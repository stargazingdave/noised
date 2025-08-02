import { BaseGenerator } from "./BaseGenerator";
import { RainParams, OscParam } from "./types/RainParams";

export const _defaultRainParamsV2: RainParams = {
    const: {
        main: {
            volume: 0.5,
            eqGains: new Array(10).fill(0),
        },
        noise: {
            level: 0.2,
            type: 'pink',
        },
        drops: {
            dryLevel: 0.5,
            wetLevel: 0.5,
            rate: 0.5,
            decayTime: 0.5,
            q: 1,
        }
    },
    osc: {
        noise: {
            filterFreq: { value: 4000, osc: false, amp: 1000, freq: 0.1 },
        },
        drops: {
            minPitch: { value: 300, osc: false, amp: 100, freq: 0.1 },
            maxPitch: { value: 800, osc: false, amp: 500, freq: 0.1 },
            reverbLevel: { value: 0.4, osc: false, amp: 0.2, freq: 0.1 },
            panRange: { value: 1.0, osc: false, amp: 0.5, freq: 0.1 },
        }
    }
};

export class RainGenerator extends BaseGenerator<RainParams> {
    private time = 0;
    private dropInterval = 0;

    private dropGainNode = this.ctx.createGain();
    private noiseGainNode = this.ctx.createGain();
    private dryDropGainNode = this.ctx.createGain();
    private wetDropGainNode = this.ctx.createGain();
    private reverbNode = this.ctx.createConvolver();
    private noiseFilter = this.ctx.createBiquadFilter();
    private noiseGain = this.ctx.createGain();

    private noiseSource: AudioBufferSourceNode | null = null;

    constructor(ctx: AudioContext, destination: AudioNode, initialParams: RainParams) {
        super(ctx, destination, initialParams, true, [100, 300, 600, 1200, 2400, 4800]);

        this.reverbNode.buffer = this.generateImpulseBuffer(2, 2.5);
        this.reverbNode.connect(this.gainNode);

        this.noiseFilter.type = "lowpass";

        this.dryDropGainNode.connect(this.dropGainNode);
        this.wetDropGainNode.connect(this.dropGainNode);
        this.dropGainNode.connect(this.gainNode);
        this.noiseGainNode.connect(this.gainNode);
    }

    start() {
        this.noiseSource = this.ctx.createBufferSource();
        this.noiseSource.buffer = this.createNoiseBuffer(this.params.const.noise.type);
        this.noiseSource.loop = true;

        this.noiseFilter.frequency.value = this.params.osc.noise.filterFreq.value;
        this.noiseGain.gain.value = this.params.const.noise.level;

        this.noiseSource.connect(this.noiseFilter);
        this.noiseFilter.connect(this.noiseGainNode);
        this.noiseGainNode.gain.value = this.params.const.noise.level;

        this.noiseSource.start();
    }

    stop() {
        if (this.noiseSource) {
            this.noiseSource.stop();
            this.noiseSource.disconnect();
            this.noiseSource = null;
        }
        this.dropInterval = 0;
    }

    destroy() {
        this.stop();
        this.noiseFilter.disconnect();
        this.noiseGain.disconnect();
    }

    tick(dt: number) {
        this.time += dt;
        this.dropInterval += dt;

        const timePerDrop = 1 / this.params.const.drops.rate;

        while (this.dropInterval >= timePerDrop) {
            this.dropInterval -= timePerDrop;
            this.scheduleDrop();
        }

        this.applyOsc(this.params.osc.drops.minPitch, ["osc", "drops", "minPitch"]);
        this.applyOsc(this.params.osc.drops.maxPitch, ["osc", "drops", "maxPitch"]);
        this.applyOsc(this.params.osc.drops.reverbLevel, ["osc", "drops", "reverbLevel"]);
        this.applyOsc(this.params.osc.drops.panRange, ["osc", "drops", "panRange"]);
        this.applyOsc(this.params.osc.noise.filterFreq, ["osc", "noise", "filterFreq"]);
        this.noiseFilter.frequency.value = this.params.osc.noise.filterFreq.value;
    }

    private scheduleDrop() {
        const now = this.ctx.currentTime;
        const duration = this.params.const.drops.decayTime;
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;

        const env = this.ctx.createGain();
        env.gain.setValueAtTime(1, now);
        env.gain.exponentialRampToValueAtTime(0.001, now + duration);

        const filter = this.ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = this.randomBetween(
            this.params.osc.drops.minPitch.value,
            this.params.osc.drops.maxPitch.value
        );
        filter.Q.value = this.params.const.drops.q;

        const pan = this.ctx.createStereoPanner();
        pan.pan.value = this.randomBetween(
            -this.params.osc.drops.panRange.value,
            this.params.osc.drops.panRange.value
        );

        const dry = this.ctx.createGain();
        dry.gain.value = this.params.const.drops.dryLevel;

        const wet = this.ctx.createGain();
        wet.gain.value = this.params.const.drops.wetLevel;

        noise.connect(env);
        env.connect(filter);
        filter.connect(pan);
        pan.connect(dry);
        pan.connect(wet);
        dry.connect(this.dryDropGainNode);
        wet.connect(this.wetDropGainNode);

        noise.start(now);
        noise.stop(now + duration + 0.05);
    }

    private createNoiseBuffer(type: "white" | "pink"): AudioBuffer {
        const length = this.ctx.sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        if (type === "white") {
            for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
        } else {
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (let i = 0; i < length; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                b6 = white * 0.115926;
                data[i] = pink * 0.11;
            }
        }

        return buffer;
    }

    private generateImpulseBuffer(channels: number, duration: number): AudioBuffer {
        const rate = this.ctx.sampleRate;
        const length = rate * duration;
        const buffer = this.ctx.createBuffer(channels, length, rate);

        for (let c = 0; c < channels; c++) {
            const data = buffer.getChannelData(c);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
            }
        }

        return buffer;
    }

    private applyOsc(param: OscParam, path: string[]) {
        const modulated = param.value + Math.sin(this.time * param.freq * 2 * Math.PI) * param.amp;
        let obj: any = this.params;
        for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
        obj[path[path.length - 1]] = { ...param, value: modulated };
    }

    private randomBetween(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }
}
