import { RunService } from "@rbxts/services"
import Net from "@rbxts/net-ts"
const IsServer = RunService.IsServer()
const STORES_NAME = "$Stores$"
const GLOBALS = _G as Record<any, any>

if (!GLOBALS[STORES_NAME]) {
    GLOBALS[STORES_NAME] = {
        Values: {},
        Sets: {},
        Maps: {},
    }
} const StoreContainer: { Values: Record<string, any | undefined>, Sets: Record<string, Set<any> | undefined>, Maps: Record<string, Map<any, any> | undefined> } = GLOBALS[STORES_NAME]

function deepcopy(obj: unknown, seen?: unknown): any {
    // Handle non-tables and previously-seen tables.
    if (type(obj) !== 'table') { return obj }
    if (seen && (seen as any)[obj as any]) { return (seen as any)[obj as any] }

    // New table; mark it as seen and copy recursively.
    let s: Record<any, any> = seen || { }
    let res: Record<any, any> = {}

    s[obj as any] = res
    for (let [k, v] of pairs(obj as any)) {
        res[deepcopy(k, s)] = deepcopy(v, s)
    }
    return setmetatable(res, getmetatable(obj as any) as any)
}

export type ValueStoreListener<T> = (newValue: T | undefined, oldValue: T | undefined) => any
export type ValueStoreEvent = 'change' | 'set' | 'init'

export type SetStoreListener<T> = (value: T) => any
export type SetStoreEvent = 'add' | 'delete'

export type MapStoreListener<K, T> = (key: K, value?: T) => any
export type MapStoreEvent = 'set'
export class ValueStore<T> {
    private Shared: boolean
    private StoreName: string
    private StoreNet: Net
    private Listeners: Set<{ event: ValueStoreEvent, listener: ValueStoreListener<T> }>
    constructor(StoreName: string, Shared?: boolean, InitializeValue?: T) {
        this.Listeners = new Set()
        this.StoreName = StoreName
        this.Shared = Shared || false
        this.StoreNet = new Net(`${STORES_NAME}/${this.StoreName}`)
        this.InitializeEvents()
        if (InitializeValue !== undefined && StoreContainer.Values[this.StoreName] === undefined) {
            this.StoreNet.emit('Update Value', { oldValue: StoreContainer.Values[this.StoreName], newValue: InitializeValue, event: 'init' })
            StoreContainer.Values[this.StoreName] = InitializeValue
            if (this.Shared && IsServer) {
                this.StoreNet.emit('Update Value', { oldValue: StoreContainer.Values[this.StoreName], newValue: InitializeValue, event: 'init' }, true)
            }
        }
    }
    private InitializeEvents() {
        this.StoreNet.addListener('Update Value', ({ oldValue, newValue, event }) => { this.CallListeners(event, oldValue, newValue) })
        if (this.Shared) {
            if (IsServer) {
                this.StoreNet.addListener('Initialize Client', () => {
                    if (StoreContainer.Values[this.StoreName] === undefined) { return STORES_NAME + 'emptyvalue' }
                    return StoreContainer.Values[this.StoreName]
                }, true)
            } else {
                task.spawn(() => {
                    let newValue: unknown = this.StoreNet.emit('Initialize Client', {}, true, true)
                    if (newValue === STORES_NAME + 'emptyvalue') { newValue = undefined }
                    if (StoreContainer.Values[this.StoreName]) { return }
                    StoreContainer.Values[this.StoreName] = newValue
                    this.CallListeners('init', StoreContainer.Values[this.StoreName], newValue as T)
                })
                this.StoreNet.addListener('Update Client', ({ Value }) => {
                    StoreContainer.Values[this.StoreName] = Value
                    this.CallListeners('set', StoreContainer.Values[this.StoreName], Value)
                }, true)
            }
        }
    }
    public On(event: ValueStoreEvent, listener: ValueStoreListener<T>) {
        this.Listeners.add({ listener, event })
    }
    private CallListeners(_event: ValueStoreEvent, oldValue: T | undefined, newValue: T | undefined) {
        const _newValue = deepcopy(StoreContainer.Values[this.StoreName])
        const _oldValue = deepcopy(oldValue)
        this.Listeners.forEach(({ listener, event }) => {
            if (event !== 'change' && event !== _event) { return }
            listener(_newValue, _oldValue)
        })
    }
    public SetValue(newValue: T | undefined) {
        const oldValue = StoreContainer.Values[this.StoreName]
        this.StoreNet.emit('Update Value', { oldValue, newValue, event: 'set' })
        StoreContainer.Values[this.StoreName] = newValue
        if (IsServer && this.Shared) {
            this.StoreNet.emit('Update Client', { Value: newValue }, true)
        }
    }
    public GetValue(): T | undefined {
        return deepcopy(StoreContainer.Values[this.StoreName])
    }
    public ClearValue() {
        const oldValue = StoreContainer.Values[this.StoreName]
        this.StoreNet.emit('Update Value', { oldValue, newValue: undefined, event: 'set' })
        StoreContainer.Values[this.StoreName] = undefined
        if (IsServer && this.Shared) {
            this.StoreNet.emit('Update Client', { Value: undefined })
        }
    }
}

export class SetStore<T> {
    private Shared: boolean
    private StoreName: string
    private StoreNet: Net
    private Listeners: Set<{ event: SetStoreEvent, listener: SetStoreListener<T> }>
    constructor(StoreName: string, Shared?: boolean, InitializeValue?: T[]) {
        this.Listeners = new Set()
        this.StoreName = StoreName
        this.Shared = Shared || false
        this.StoreNet = new Net(`${STORES_NAME}/${this.StoreName}`)
        this.InitializeEvents()
        if (InitializeValue !== undefined && InitializeValue.size() > 0) {
            StoreContainer.Sets[this.StoreName] = new Set(InitializeValue as any[])
            StoreContainer.Sets[this.StoreName]!.forEach((value: any) => {
                this.StoreNet.emit('Update Value', { Value: value, event: 'add' })
            })
            if (this.Shared && IsServer) {
                this.StoreNet.emit('Update Client', { Value: StoreContainer.Sets[this.StoreName] }, true)
            }
        }
    }
    private InitializeEvents() {
        this.StoreNet.addListener('Update Value', ({ Value, event }) => { this.CallListeners(event, Value) })
        if (this.Shared) {
            if (IsServer) {
                this.StoreNet.addListener('Initialize Client', () => {
                    if (StoreContainer.Sets[this.StoreName] === undefined) { return [] }
                    let a: any[] = []
                    StoreContainer.Sets[this.StoreName]!.forEach((b) => { a.push(b) })
                    return a
                }, true)
            } else {
                task.spawn(() => {
                    const Value = this.StoreNet.emit('Initialize Client', {}, true, true) as any[]
                    if (StoreContainer.Sets[this.StoreName]) { return }
                    StoreContainer.Sets[this.StoreName] = new Set(Value)
                    StoreContainer.Sets[this.StoreName]!.forEach((value) => {
                        this.CallListeners('add', value)
                    })
                })
                this.StoreNet.addListener('Update Client', ({ Value }: { Value?: any[] }) => {
                    if (StoreContainer.Sets[this.StoreName] && !Value) {
                        StoreContainer.Sets[this.StoreName]!.forEach((val) => {
                            this.CallListeners('delete', val)
                        })
                        StoreContainer.Sets[this.StoreName]!.clear()
                        StoreContainer.Sets[this.StoreName] = undefined
                    } else if (!StoreContainer.Sets[this.StoreName] && Value) {
                        StoreContainer.Sets[this.StoreName] = new Set<T>(Value)
                        StoreContainer.Sets[this.StoreName]!.forEach((val) => {
                            this.CallListeners('add', val)
                        })
                        if (StoreContainer.Sets[this.StoreName]!.size() > 0) { return }
                        StoreContainer.Sets[this.StoreName] = undefined
                    } else if (StoreContainer.Sets[this.StoreName] && Value) {
                        let last = StoreContainer.Sets[this.StoreName]!
                        StoreContainer.Sets[this.StoreName] = new Set<T>(Value)
                        StoreContainer.Sets[this.StoreName]!.forEach((val) => {
                            if (last.has(val)) { return }
                            this.CallListeners('add', val)
                        })
                        last.forEach((val) => {
                            if (StoreContainer.Sets[this.StoreName]!.has(val)) { return }
                            this.CallListeners('delete', val)
                        })
                        last.clear()
                        if (StoreContainer.Sets[this.StoreName]!.size() > 0) { return }
                        StoreContainer.Sets[this.StoreName] = undefined
                    }
                }, true)
            }
        }
    }
    public On(event: SetStoreEvent, listener: SetStoreListener<T>) {
        this.Listeners.add({ listener, event })
    }
    private CallListeners(_event: SetStoreEvent, value: T) {
        const _value = deepcopy(value)
        this.Listeners.forEach(({ listener, event }) => {
            if (event !== _event) { return }
            listener(_value)
        })
    }
    public SetValue(Value?: T[]) {
        if (StoreContainer.Sets[this.StoreName] && !Value) {
            StoreContainer.Sets[this.StoreName]!.forEach((val) => {
                this.StoreNet.emit('Update Value', { Value: val, event: 'delete' })
            })
            StoreContainer.Sets[this.StoreName]!.clear()
            StoreContainer.Sets[this.StoreName] = undefined
        } else if (!StoreContainer.Sets[this.StoreName] && Value) {
            StoreContainer.Sets[this.StoreName] = new Set<T>(Value)
            StoreContainer.Sets[this.StoreName]!.forEach((val) => {
                this.StoreNet.emit('Update Value', { Value: val, event: 'add' })
            })
            if (StoreContainer.Sets[this.StoreName]!.size() <= 0) {
                StoreContainer.Sets[this.StoreName] = undefined
            }
        } else if (StoreContainer.Sets[this.StoreName] && Value) {
            let last = StoreContainer.Sets[this.StoreName]!
            StoreContainer.Sets[this.StoreName] = new Set<T>(Value)
            StoreContainer.Sets[this.StoreName]!.forEach((val: T) => {
                if (last!.has(val)) { return }
                this.StoreNet.emit('Update Value', { Value: val, event: 'add' })
            })
            last!.forEach((val) => {
                if (StoreContainer.Sets[this.StoreName]!.has(val)) { return }
                this.StoreNet.emit('Update Value', { Value: val, event: 'delete' })
            })
            last.clear()
            if (StoreContainer.Sets[this.StoreName]!.size() <= 0) {
                StoreContainer.Sets[this.StoreName] = undefined
            }
        }
        if (IsServer && this.Shared) {
            if (StoreContainer.Sets[this.StoreName] === undefined) {
                this.StoreNet.emit('Update Client', { Value: undefined }, true)
                return
            }
            let a: any[] = []
            StoreContainer.Sets[this.StoreName]!.forEach((b) => { a.push(b) })
            this.StoreNet.emit('Update Client', { Value: a }, true)
        }
    }
    public GetValue() {
        if (!StoreContainer.Sets[this.StoreName]) { return new Set() }
        return deepcopy(StoreContainer.Sets[this.StoreName]!)
    }
    public ClearValue() {
        if (!StoreContainer.Sets[this.StoreName]) { return }
        StoreContainer.Sets[this.StoreName]!.forEach((Value) => {
            this.StoreNet.emit('Update Value', { Value, event: 'delete' })
        })
        StoreContainer.Sets[this.StoreName]!.clear()
        this.StoreNet.emit('Update Client', { Value: undefined }, true)
        StoreContainer.Sets[this.StoreName] = undefined
    }
    public Add(Value: T) {
        if (!StoreContainer.Sets[this.StoreName]) { StoreContainer.Sets[this.StoreName] = new Set<T>() }
        StoreContainer.Sets[this.StoreName]!.add(Value)
        this.StoreNet.emit('Update Value', { Value, event: 'add' })
        if (IsServer && this.Shared) {
            let a: any[] = []
            StoreContainer.Sets[this.StoreName]!.forEach((b) => { a.push(b) })
            this.StoreNet.emit('Update Client', { Value: a }, true)
        }
    }
    public Delete(Value: T) {
        if (!StoreContainer.Sets[this.StoreName]) { StoreContainer.Sets[this.StoreName] = new Set<T>() }
        StoreContainer.Sets[this.StoreName]!.delete(Value)
        this.StoreNet.emit('Update Value', { Value, event: 'delete' })
        if (IsServer && this.Shared) {
            let a: any[] = []
            StoreContainer.Sets[this.StoreName]!.forEach((b) => { a.push(b) })
            this.StoreNet.emit('Update Client', { Value: a }, true)
        }
        if (StoreContainer.Sets[this.StoreName]!.size() <= 0) { StoreContainer.Sets[this.StoreName] = undefined }
    }
    public Has(Value: T) {
        if (!StoreContainer.Sets[this.StoreName]) { return false }
        return StoreContainer.Sets[this.StoreName]!.has(Value)
    }
    public Size() {
        if (!StoreContainer.Sets[this.StoreName]) { return 0 }
        return StoreContainer.Sets[this.StoreName]!.size()
    }
    public ForEach(callback: (value?: T, value2?: T, itself?: ReadonlySet<T>) => unknown) {
        if (!StoreContainer.Sets[this.StoreName]) { return }
        (deepcopy(StoreContainer.Sets[this.StoreName]!) as Set<T>).forEach((value: any, value2: any, itself: any) => {
            callback(value, value2, itself)
        })
    }
}

export class MapStore<K, T> {
    private Shared: boolean
    private StoreName: string
    private StoreNet: Net
    private Listeners: Set<{ event: MapStoreEvent, listener: MapStoreListener<K, T>}>
    constructor(StoreName: string, Shared?: boolean, InitializeValue?: [K,T][]) {
        this.Listeners = new Set()
        this.StoreName = StoreName
        this.Shared = Shared || false
        this.StoreNet = new Net(`${STORES_NAME}/${this.StoreName}`)
        this.InitializeEvents()
        if (InitializeValue !== undefined && InitializeValue.size() > 0) {
            StoreContainer.Maps[this.StoreName] = new Map(InitializeValue)
            StoreContainer.Maps[this.StoreName]!.forEach((value: any, key: any) => {
                this.StoreNet.emit('Update Value', { Value: value, Key: key, event: 'set' })
            })
            if (this.Shared && IsServer) {
                this.StoreNet.emit('Update Client', { Value: StoreContainer.Maps[this.StoreName] }, true)
            }
        }
    }
    private InitializeEvents() {
        this.StoreNet.addListener('Update Value', ({ Key, Value, event }) => { this.CallListeners(event, Key, Value) })
        if (this.Shared) {
            if (IsServer) {
                this.StoreNet.addListener('Initialize Client', () => {
                    if (StoreContainer.Maps[this.StoreName] === undefined) { return [] }
                    let a: any[] = []
                    StoreContainer.Maps[this.StoreName]!.forEach((V, K) => { a.push([K, V]) })
                    return a
                }, true)
            } else {
                task.spawn(() => {
                    const Value = this.StoreNet.emit('Initialize Client', {}, true, true) as any[]
                    if (StoreContainer.Maps[this.StoreName]) { return }
                    StoreContainer.Maps[this.StoreName] = new Map(Value)
                    StoreContainer.Maps[this.StoreName]!.forEach((value, key) => {
                        this.CallListeners('set', key, value)
                    })
                })
                this.StoreNet.addListener('Update Client', ({ Value }: { Value?: [K, T][] }) => {
                    if (StoreContainer.Maps[this.StoreName] && !Value) {
                        StoreContainer.Maps[this.StoreName]!.forEach((val, key) => {
                            this.CallListeners('set', key, undefined)
                        })
                        StoreContainer.Maps[this.StoreName]!.clear()
                        StoreContainer.Maps[this.StoreName] = undefined
                    } else if (!StoreContainer.Maps[this.StoreName] && Value) {
                        StoreContainer.Maps[this.StoreName] = new Map(Value)
                        StoreContainer.Maps[this.StoreName]!.forEach((val, key) => {
                            this.CallListeners('set', key, val)
                        })
                        if (StoreContainer.Maps[this.StoreName]!.size() > 0) { return }
                        StoreContainer.Maps[this.StoreName] = undefined
                    } else if (StoreContainer.Maps[this.StoreName] && Value) {
                        let last = StoreContainer.Maps[this.StoreName]!
                        StoreContainer.Maps[this.StoreName] = new Map(Value)
                        StoreContainer.Maps[this.StoreName]!.forEach((val: unknown, key: unknown) => {
                            const current: unknown = last.get(key)
                            if (current && current === val) { return }
                            this.CallListeners('set', key as K, val as T)
                        })
                        last.forEach((val, key) => {
                            if (StoreContainer.Maps[this.StoreName]!.has(key)) { return }
                            this.CallListeners('set', key, undefined)
                        })
                        last.clear()
                        if (StoreContainer.Maps[this.StoreName]!.size() > 0) { return }
                        StoreContainer.Maps[this.StoreName] = undefined
                    }
                }, true)
            }
        }
    }
    private CallListeners(_event: MapStoreEvent, key: K, value?: T) {
        const _key = deepcopy(key)
        const _value = deepcopy(value)
        this.Listeners.forEach(({ listener, event }) => {
            if (event !== _event) { return }
            listener(_key, _value)
        })
    }
    public On(event: MapStoreEvent, listener: MapStoreListener<K, T>) {
        this.Listeners.add({ listener, event })
    }
    public SetValue(Value?: [K,T][]) {
        if (StoreContainer.Maps[this.StoreName] && !Value) {
            StoreContainer.Maps[this.StoreName]!.forEach((val, key) => {
                this.StoreNet.emit('Update Value', { Value: val, Key: key, event: 'set' })
            })
            StoreContainer.Maps[this.StoreName]!.clear()
            StoreContainer.Maps[this.StoreName] = undefined
        } else if (!StoreContainer.Maps[this.StoreName] && Value) {
            StoreContainer.Maps[this.StoreName] = new Map(Value)
            StoreContainer.Maps[this.StoreName]!.forEach((val, key) => {
                this.StoreNet.emit('Update Value', { Value: val, Key: key, event: 'set' })
            })
            if (StoreContainer.Maps[this.StoreName]!.size() > 0) { return }
            StoreContainer.Maps[this.StoreName] = undefined
        } else if (StoreContainer.Maps[this.StoreName] && Value) {
            let last = StoreContainer.Maps[this.StoreName]!
            StoreContainer.Maps[this.StoreName] = new Map(Value)
            StoreContainer.Maps[this.StoreName]!.forEach((val: unknown, key: unknown) => {
                const current: unknown = last.get(key)
                if (current && current === val) { return }
                this.StoreNet.emit('Update Value', { Value: val, Key: key, event: 'set' })
            })
            last.forEach((val, key) => {
                if (StoreContainer.Maps[this.StoreName]!.has(key)) { return }
                this.StoreNet.emit('Update Value', { Value: undefined, Key: key, event: 'set' })
            })
            last.clear()
            if (StoreContainer.Maps[this.StoreName]!.size() > 0) { return }
            StoreContainer.Maps[this.StoreName] = undefined
        }
        if (IsServer && this.Shared) {
            if (StoreContainer.Maps[this.StoreName] === undefined) {
                this.StoreNet.emit('Update Client', { Value: undefined }, true)
                return
            }
            let a: any[] = []
            StoreContainer.Maps[this.StoreName]!.forEach((V, K) => { a.push([K, V]) })
            this.StoreNet.emit('Update Client', { Value: a }, true)
        }
    }
    public GetValue() {
        if (!StoreContainer.Maps[this.StoreName]) { return new Map() }
        return deepcopy(StoreContainer.Maps[this.StoreName]!)
    }
    public ClearValue() {
        if (!StoreContainer.Maps[this.StoreName]) { return }
        StoreContainer.Maps[this.StoreName]!.forEach((Value, Key) => {
            this.StoreNet.emit('Update Value', { Key, Value: undefined, event: 'set' })
        })
        StoreContainer.Maps[this.StoreName]!.clear()
        this.StoreNet.emit('Update Client', { Value: undefined }, true)
        StoreContainer.Maps[this.StoreName] = undefined
    }
    public Set(Key: K, Value: T) {
        if (!StoreContainer.Maps[this.StoreName]) { StoreContainer.Maps[this.StoreName] = new Map() }
        StoreContainer.Maps[this.StoreName]!.set(Key, Value)
        this.StoreNet.emit('Update Value', { Value, Key, event: 'set' })
        if (IsServer && this.Shared) {
            if (StoreContainer.Maps[this.StoreName] === undefined) { return [] }
            let a: any[] = []
            StoreContainer.Maps[this.StoreName]!.forEach((V, K) => { a.push([K, V]) })
            this.StoreNet.emit('Update Client', { Value: a }, true)
        }
        if (StoreContainer.Maps[this.StoreName]!.size() <= 0) { StoreContainer.Maps[this.StoreName] = undefined }
    }
    public Get(Key: K) {
        if (!StoreContainer.Maps[this.StoreName]) { return }
        return deepcopy(StoreContainer.Maps[this.StoreName]!.get(Key))
    }
    public Delete(Key: T) {
        if (!StoreContainer.Maps[this.StoreName]) { StoreContainer.Maps[this.StoreName] = new Map() }
        StoreContainer.Maps[this.StoreName]!.set(Key, undefined)
        this.StoreNet.emit('Update Value', { Value: undefined, Key, event: 'set' })
        if (IsServer && this.Shared) {
            if (StoreContainer.Maps[this.StoreName] === undefined) { return [] }
            let a: any[] = []
            StoreContainer.Maps[this.StoreName]!.forEach((V, K) => { a.push([K, V]) })
            this.StoreNet.emit('Update Client', { Value: a }, true)
        }
        if (StoreContainer.Maps[this.StoreName]!.size() <= 0) { StoreContainer.Maps[this.StoreName] = undefined }
    }
    public Has(key: K) {
        if (!StoreContainer.Maps[this.StoreName]) { return false }
        return StoreContainer.Maps[this.StoreName]!.has(key)
    }
    public Size() {
        if (!StoreContainer.Maps[this.StoreName]) { return 0 }
        return StoreContainer.Maps[this.StoreName]!.size()
    }
    public ForEach(callback: (value?: T, key?: K, itself?: ReadonlyMap<K, T>) => unknown) {
        if (!StoreContainer.Maps[this.StoreName]) { return }
        (deepcopy(StoreContainer.Maps[this.StoreName]!) as Map<K, T>).forEach((value: any, key: any, itself: any) => {
            callback(value, key, itself)
        })
    }
}