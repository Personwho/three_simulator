// 抽象基類
export class BaseMechanic {
    update(floor, dt, nowMs) { throw new Error("Must implement"); }
}