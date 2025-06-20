
class Node<K, V>{
    private _data: V | undefined; 
    private _key: K | undefined; 

    private _prev: Node<K, V> | undefined; 
    private _next: Node<K, V> | undefined; 
    

    constructor(data?: V, key?: K, next?: Node<K, V>, prev?: Node<K, V>) {
        this.data = data; 
        this.next = next; 
        this.prev = prev; 
        this.key = key; 
    }

    public get next(): Node<K, V> | undefined {
        return this._next;
    }
    public set next(value: Node<K, V> | undefined) {
        this._next = value;
    }
    public get prev(): Node<K, V> | undefined {
        return this._prev;
    }
    public set prev(value: Node<K, V> | undefined) {
        this._prev = value;
    }

    public get key(): K | undefined {
        return this._key;
    }
    public set key(value: K | undefined) {
        this._key = value;
    }
    public get data(): V | undefined {
        return this._data;
    }
    public set data(value: V | undefined) {
        this._data = value;
    }

    public isEmpty(): boolean {
        return this.data === undefined && this.next === undefined && this.prev === undefined; 
    }
}

export class Cache<K,V>{
    nodeMap: Map<K, Node<K, V>>; 
    private head: Node<K, V>;
    private tail: Node<K, V>;
    private size: number; 

    constructor(maxSize: number = 10) {
        this.validateMaxSize(maxSize); 
        this.size = maxSize; 
        this.nodeMap = new Map<K,Node<K, V>>();
        this.head = new Node(); 
        this.tail = new Node(undefined, undefined, this.head); 
        this.head.next = this.tail; 
    }


    private validateMaxSize(maxSize: number) {
        if (maxSize < 1) {
            throw Error("Size must be greater than or equal to one"); 
        }
        if (!Number.isInteger(maxSize)) {
            throw Error("Max size must be an integer"); 
        }
    }

    private moveFront(node: Node<K, V>) {
        if (node.next === undefined) {
            throw Error("Node without next node was added to list");
        }
        node.next.prev = node.prev;
        if (node.prev === undefined) {
            throw Error("Node without prev node was added to list"); 
        }
        node.prev.next = node.next;

        node.prev = this.head;
        node.next = this.head.next;
        if (this.head.next === undefined) {
            throw Error("Head node points to undefined"); 
        }
        this.head.next.prev = node;
        this.head.next = node; 
    }

    private insertFront(value: V, key: K) {
        const createdNode = new Node(value, key, this.head.next, this.head); 
        this.head.next = createdNode; 
        createdNode.next!.prev = createdNode;
        return createdNode; 
    }

    private trimBack() {
        if (this.tail.prev === undefined) {
            throw Error("unexpected undefined head"); 
        }
        const removeNode = this.tail.prev; 
        this.tail.prev = this.tail.prev.prev;
        if (this.tail.prev === undefined) {
            throw Error("unexpected undefined prev"); 
        }
        this.tail.prev.next = this.tail; 

        if (removeNode.key === undefined) {
            throw Error("Cache node should not have an undefined key"); 
        }

        this.nodeMap.delete(removeNode.key!); 
        
    }

    public get(key: K): V | undefined {
        let targetNode = this.nodeMap.get(key);
        if (targetNode === undefined) {
            return undefined; 
        }

        this.moveFront(targetNode); 
        return targetNode.data; 
    };

    public set(key: K, value: V) {
        const target = this.nodeMap.get(key); 
        if (target) {
            target.data = value; 
            this.moveFront(target); 
            return;
        }

        const createdNode = this.insertFront(value, key); 
        this.nodeMap.set(key, createdNode); 

        if (this.nodeMap.size > this.size) {
            this.trimBack(); 
        }
    };

    public clear() {
        this.head.next = this.tail;
        this.tail.prev = this.head; 

        this.nodeMap.clear();
    }

    *[Symbol.iterator]() {
        for (const [key, value] of this.nodeMap) {
            yield {
                key: key, 
                value: value.data
            };
        }
    }

    public toString() {
        const stringArray = new Array();
        let ptr = this.head.next;
        while (ptr !== this.tail) {
            stringArray.push(JSON.stringify(ptr!.key));
            ptr = ptr?.next; 
        }
        return stringArray.join('\n'); 
    }
}