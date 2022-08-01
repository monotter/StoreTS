import { RunService } from "@rbxts/services"
import Net from "@rbxts/net-ts"

const IsServer = RunService.IsServer()
const STORES_NAME = "$Stores$"
export type ValueStoreListener<T> = (newValue: T | undefined, oldValue: T | undefined) => any
export type ValueStoreEvent = 'change' | 'set' | 'init'

export type SetStoreListener<T> = (value: T) => any
export type SetStoreEvent = 'add' | 'delete'

export type MapStoreListener<K, T> = (key: K, value?: T) => any
export type MapStoreEvent = 'set' | 'delete'
export class ValueStore<T> {
    private StoreValue?: T
    private Shared: boolean
    private StoreName: string
    private StoreNet: Net
    private Listeners: Set<{ event: ValueStoreEvent, listener: ValueStoreListener<T> }>
    constructor(StoreName: string, Shared?: boolean, InitializeValue?: T) {
        this.Listeners = new Set()
        this.StoreName = StoreName
        this.Shared = Shared || false
        this.StoreNet = new Net(`${STORES_NAME}/${this.StoreName}`)
        this.Initialize()
        if (InitializeValue !== undefined) {
            this.StoreValue = InitializeValue
            this.StoreNet.emit('Update Value', { newValue: this.StoreValue, event: 'init' })
        }
    }
    private Initialize() {
        this.StoreNet.addListener('Update Value', ({ newValue, event }) => {
            this.UpdateValue(event, newValue)
        })
        if (this.Shared) {
            if (IsServer) {
                this.StoreNet.addListener('Initialize Client', () => {
                    return this.Get()
                }, true)
            } else {
                this.StoreNet.addListener('Update Value', ({ newValue, event }) => {
                    this.UpdateValue(event, newValue)
                }, true)
                task.spawn(() => {
                    const newValue = this.StoreNet.emit('Initialize Client', { }, true, true)
                    this.UpdateValue('init', newValue)
                })
            }
        }
    }
    private UpdateValue(_event: ValueStoreEvent, newValue: T | undefined) {
        const oldValue = this.StoreValue
        this.StoreValue = newValue
        this.Listeners.forEach(({ listener, event }) => {
            if (event !== 'change' && event !== _event) { return }
            listener(newValue, oldValue)
        })
    }
    public On(event: ValueStoreEvent, listener: ValueStoreListener<T>) {
        this.Listeners.add({ listener, event })
    }
    public Set(newValue: T | undefined) {
        this.StoreNet.emit('Update Value', { newValue, event: 'set' })
        if (IsServer && this.Shared) {
            this.StoreNet.emit('Update Value', { newValue, event: 'set' }, true)
        }
    }
    public Get(): T | undefined {
        return this.StoreValue
    }
}

export class SetStore<T> {
    private StoreValue: Set<T>
    private Shared: boolean
    private StoreName: string
    private StoreNet: Net
    private Listeners: Set<{ event: SetStoreEvent, listener: SetStoreListener<T> }>
    constructor(StoreName: string, Shared?: boolean) {
        this.Listeners = new Set()
        this.StoreName = StoreName
        this.Shared = Shared || false
        this.StoreNet = new Net(`${STORES_NAME}/${this.StoreName}`)
        this.StoreValue = new Set()
        this.Initialize()
    }
    private Initialize() {
        this.StoreNet.addListener('Update Value', ({ Value, event }) => {
            this.UpdateValue(event, Value)
        })
        if (this.Shared) {
            if (IsServer) {
                this.StoreNet.addListener('Initialize Client', () => {
                    return this.StoreValue
                }, true)
            } else {
                this.StoreNet.addListener('Update Value', ({ Value, event }) => {
                    this.UpdateValue(event, Value)
                }, true)
                task.spawn(() => {
                    const Value = this.StoreNet.emit('Initialize Client', { }, true, true) as Set<T>
                    Value.forEach((value) => {
                        this.UpdateValue('add', value)
                    })
                })
            }
        }
    }
    private UpdateValue(_event: SetStoreEvent, value: T) {
        if (_event === 'add') {
            this.StoreValue.add(value)
        } else if (_event === 'delete') {
            this.StoreValue.delete(value)
        }
        this.Listeners.forEach(({ listener, event }) => {
            if (event !== _event) { return }
            listener(value)
        })
    }
    public On(event: SetStoreEvent, listener: SetStoreListener<T>) {
        this.Listeners.add({ listener, event })
    }
    public Add(Value: T) {
        this.StoreNet.emit('Update Value', { Value, event: 'add' })
        if (IsServer && this.Shared) {
            this.StoreNet.emit('Update Value', { Value, event: 'add' }, true)
        }
    }
    public Delete(Value: T) {
        this.StoreNet.emit('Update Value', { Value, event: 'delete' })
        if (IsServer && this.Shared) {
            this.StoreNet.emit('Update Value', { Value, event: 'delete' }, true)
        }
    }
    public Clear() {
        this.StoreValue.forEach((Value) => {
            this.UpdateValue('delete', Value)
            this.StoreNet.emit('Update Value', { Value, event: 'delete' })
            if (IsServer && this.Shared) {
                this.StoreNet.emit('Update Value', { Value, event: 'delete' }, true)
            }
        })
    }
    public Has(Value: T) {
        return this.StoreValue.has(Value)
    }
    public Size(Value: T) {
        return this.StoreValue.size()
    }
    public ForEach(callback: (value1?: T, value2?: T, itself?: ReadonlySet<T>) => unknown) {
        this.StoreValue.forEach((value1, value2, itself) => {
            callback(value1, value2, itself)
        })
    }
}

export class MapStore<K, T> {
    private StoreValue: Map<K, T>
    private Shared: boolean
    private StoreName: string
    private StoreNet: Net
    private Listeners: Set<{ event: MapStoreEvent, listener: MapStoreListener<K, T> }>
    constructor(StoreName: string, Shared?: boolean) {
        this.Listeners = new Set()
        this.StoreName = StoreName
        this.Shared = Shared || false
        this.StoreNet = new Net(`${STORES_NAME}/${this.StoreName}`)
        this.StoreValue = new Map()
        this.Initialize()
    }
    private Initialize() {
        this.StoreNet.addListener('Update Value', ({ Key, Value, event }) => {
            this.UpdateValue(event, Key, Value)
        })
        if (this.Shared) {
            if (IsServer) {
                this.StoreNet.addListener('Initialize Client', () => {
                    return this.StoreValue
                }, true)
            } else {
                this.StoreNet.addListener('Update Value', ({ Value, Key, event }) => {
                    this.UpdateValue(event, Key, Value)
                }, true)
                task.spawn(() => {
                    const Value = this.StoreNet.emit('Initialize Client', { }, true, true) as Map<K, T>
                    Value.forEach((value, key) => {
                        this.UpdateValue('set', key, value)
                    })
                })
            }
        }
    }
    private UpdateValue(_event: MapStoreEvent, key: K, value?: T) {
        if (_event === 'set' && value) {
            this.StoreValue.set(key, value)
        } else if (_event === 'delete') {
            this.StoreValue.delete(key)
        }
        this.Listeners.forEach(({ listener, event }) => {
            if (event !== _event) { return }
            listener(key, value)
        })
    }
    public On(event: MapStoreEvent, listener: MapStoreListener<K, T>) {
        this.Listeners.add({ listener, event })
    }
    public Set(Key: K, Value: T) {
        this.StoreNet.emit('Update Value', { Key, Value, event: 'set' })
        if (IsServer && this.Shared) {
            this.StoreNet.emit('Update Value', { Key, Value, event: 'set' }, true)
        }
    }
    public Get(Key: K) {
        return this.StoreValue.get(Key)
    }
    public Delete(Value: T) {
        this.StoreNet.emit('Update Value', { Value, event: 'delete' })
        if (IsServer && this.Shared) {
            this.StoreNet.emit('Update Value', { Value, event: 'delete' }, true)
        }
    }
    public Clear() {
        this.StoreValue.forEach((Value, Key) => {
            this.UpdateValue('delete', Key)
            this.StoreNet.emit('Update Value', { Key, event: 'delete' })
            if (IsServer && this.Shared) {
                this.StoreNet.emit('Update Value', { Key, event: 'delete' }, true)
            }
        })
    }
    public Has(key: K) {
        return this.StoreValue.has(key)
    }
    public ForEach(callback: (value?: T, key?: K, itself?: ReadonlyMap<K, T>) => unknown) {
        this.StoreValue.forEach((value, key, itself) => {
            callback(value, key, itself)
        })
    }
}