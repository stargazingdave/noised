type Range<T> = {
    min: T;
    max: T;
};

export interface RandParam {
    value: number;
    rand: boolean;
    dist: number;
}

export interface ThunderParams {
    volume: RandParam;
    delayBetweenThunders: Range<number>;
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
