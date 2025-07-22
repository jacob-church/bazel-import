import { Cache } from "../model/basecache";
import * as assert from 'assert';

const testCache: Cache<string,number> = new Cache<string,number>(3);

suite("The cache", () => {
    test("Should correctly add values", () => {
        testCache.set("test1", 1);
        testCache.set("test2", 2);
        testCache.set("test3", 3); 

        assert.strictEqual(testCache.get("test3"), 3); 
        assert.strictEqual(testCache.get("test2"), 2);
        assert.strictEqual(testCache.get("test1"), 1);
        assert.strictEqual(testCache.nodeMap.size, 3); 
    });

    test("Should correctly trim old values", () => {
        testCache.set("test3", 3); 
        testCache.set("test2", 2);
        testCache.set("test1", 1);
        testCache.set("test0", 0); 

        assert.strictEqual(testCache.nodeMap.size, 3);
        assert.strictEqual(testCache.get("test3"), undefined);
    }); 

    test("Should correctly update values", () => {
        testCache.set("test1", 10);
        assert.strictEqual(testCache.get("test1"), 10); 
        
        testCache.set("test1", 11);
        assert.strictEqual(testCache.get("test1"), 11); 
    });

    test("Should correctly rearrange on update", () => {
        testCache.set("test3", 3); 
        testCache.set("test2", 2);
        testCache.set("test1", 1);

        testCache.set("test1", 111);
        console.log(testCache); 
        console.log(testCache.toString);
    });

    test("Should be cleared", () => {
        testCache.set("test1", 1);
        testCache.set("test2", 2);
        testCache.set("test3", 3); 
        assert.strictEqual(testCache.nodeMap.size, 3);
        
        testCache.clear();
        assert.strictEqual(testCache.nodeMap.size, 0);
        assert.strictEqual(testCache.get("test3"), undefined); 
        assert.strictEqual(testCache.get("test2"), undefined);
        assert.strictEqual(testCache.get("test1"), undefined);
    });
});