export type NoiseType = "pink" | "white";

export type OscParamKeys<T> = {
    [K in keyof T]: T[K] extends OscParam ? K : never
}[keyof T];

export interface OscParam {
    value: number;
    osc: boolean;
    amp: number;
    freq: number;
}

export interface RainParams {
    const: {
        main: {
            volume: number;
            eqGains: number[];
        };
        noise: {
            level: number;
            type: NoiseType;
        },
        drops: {
            dryLevel: number;
            wetLevel: number;
            rate: number;
            decayTime: number;
            q: number;
        }
    }
    osc: {
        noise: {
            filterFreq: OscParam;
        }
        drops: {
            minPitch: OscParam;
            maxPitch: OscParam;
            reverbLevel: OscParam;
            panRange: OscParam;
        }
    }
}
