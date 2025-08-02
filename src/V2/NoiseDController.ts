import { RainGenerator } from "./RainGenerator";
import { ThunderGenerator } from "./ThunderGenerator";
import { NoiseDParams } from "./types/NoiseDParams"; // Your existing param structure
import { RainParams } from "./types/RainParams";
import { ThunderParams } from "./types/ThunderParams";

export class NoiseDController {
    private ctx: AudioContext;
    private masterGain: GainNode;
    private globalEQ: BiquadFilterNode[] = [];
    private destination: AudioNode;

    private rain: RainGenerator;
    private thunder: ThunderGenerator;

    private params: NoiseDParams;

    private eqFrequencies = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];

    constructor(initialParams: NoiseDParams) {
        this.ctx = new AudioContext();

        // Global EQ
        this.globalEQ = this.eqFrequencies.map(freq => {
            const filter = this.ctx.createBiquadFilter();
            filter.type = "peaking";
            filter.frequency.value = freq;
            filter.Q.value = 1;
            filter.gain.value = 0;
            return filter;
        });

        // Master gain
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = initialParams.masterVolume;

        // Connect EQ → gain → ctx.destination
        this.chainNodes([...this.globalEQ, this.masterGain, this.ctx.destination]);
        this.destination = this.globalEQ[0];

        this.params = initialParams;

        // Create generators with their own EQ + gain
        this.rain = new RainGenerator(this.ctx, this.destination, initialParams.rainParams);
        this.thunder = new ThunderGenerator(this.ctx, this.destination, initialParams.thunderParams);
    }

    private chainNodes(nodes: AudioNode[]) {
        for (let i = 0; i < nodes.length - 1; i++) {
            nodes[i].connect(nodes[i + 1]);
        }
    }

    start() {
        if (this.params.rainParams.on) this.rain.start();
        if (this.params.thunderParams.on) this.thunder.start();
    }

    stop() {
        this.rain.stop();
        this.thunder.stop();
    }

    destroy() {
        this.stop();
        this.rain.destroy();
        this.thunder.destroy();
        this.ctx.close();
    }

    updateParams(newParams: Partial<NoiseDParams>) {
        if (newParams.masterVolume !== undefined) {
            this.masterGain.gain.value = newParams.masterVolume;
        }

        if (newParams.rainParams) this.rain.updateParams(newParams.rainParams);
        if (newParams.thunderParams) this.thunder.updateParams(newParams.thunderParams);

        if (newParams.eqGains) {
            this.globalEQ.forEach((node, i) => {
                node.gain.value = newParams.eqGains![i] ?? 0;
            });
        }

        this.params = {
            ...this.params,
            ...newParams,
        };
    }

    updateRainParams(params: Partial<RainParams>) {
        this.rain.updateParams(params);
    }

    updateThunderParams(params: Partial<ThunderParams>) {
        this.thunder.updateParams(params);
    }

    getParams(): NoiseDParams {
        return this.params;
    }

    tick(dt: number) {
        this.rain.tick?.(dt);
        this.thunder.tick?.(dt);
    }

    setParam(path: string, value: any) {
        // Optional: Implement nested path logic like "rainParams.dropRate"
    }
}
