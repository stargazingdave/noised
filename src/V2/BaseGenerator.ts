import { IGenerator } from "./IGenerator";

export abstract class BaseGenerator<TParams extends Record<string, any>> implements IGenerator {
    protected ctx: AudioContext;
    protected destination: AudioNode;
    protected gainNode: GainNode;
    protected eqNode: BiquadFilterNode[] = []; // 10-band EQ (optional)
    protected params: TParams;

    constructor(
        ctx: AudioContext,
        destination: AudioNode,
        initialParams: TParams,
        withEQ: boolean = true,
        eqBands: number[] = [] // array of frequencies
    ) {
        this.ctx = ctx;
        this.destination = destination;
        this.params = initialParams;

        // Gain
        this.gainNode = ctx.createGain();

        // Optional EQ
        if (withEQ && eqBands.length > 0) {
            this.eqNode = eqBands.map(freq => {
                const filter = ctx.createBiquadFilter();
                filter.type = "peaking";
                filter.frequency.value = freq;
                filter.Q.value = 1;
                filter.gain.value = 0;
                return filter;
            });

            // Connect EQ chain → gain → destination
            this.chainNodes([...this.eqNode, this.gainNode, destination]);
        } else {
            // Connect gain directly → destination
            this.gainNode.connect(destination);
        }
    }

    protected chainNodes(nodes: AudioNode[]) {
        for (let i = 0; i < nodes.length - 1; i++) {
            nodes[i].connect(nodes[i + 1]);
        }
    }

    updateParams(newParams: Partial<TParams>): void {
        Object.entries(newParams).forEach(([key, value]) => {
            if (key in this.params) {
                this.params[key as keyof TParams] = value as TParams[keyof TParams];
            }
        });
    }

    setParam<K extends keyof TParams>(name: K, value: TParams[K]): void {
        this.params[name] = value;
    }

    getParams(): TParams {
        return this.params;
    }

    abstract start(): void;
    abstract stop(): void;
    abstract destroy(): void;

    tick?(dt: number): void;
}
