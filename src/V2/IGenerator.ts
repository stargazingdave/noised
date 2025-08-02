export interface IGenerator {
    start(): void;
    stop(): void;
    destroy(): void;

    updateParams(params: Partial<Record<string, any>>): void;
    setParam(name: string, value: any): void;
    getParams(): Record<string, any>;

    tick?(dt: number): void;
}
