// rd-plugin bundled output — do not edit; regenerate via `npm run build`.
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// node_modules/@noble/hashes/esm/cryptoNode.js
import * as nc from "node:crypto";
var crypto3;
var init_cryptoNode = __esm({
  "node_modules/@noble/hashes/esm/cryptoNode.js"() {
    crypto3 = nc && typeof nc === "object" && "webcrypto" in nc ? nc.webcrypto : nc && typeof nc === "object" && "randomBytes" in nc ? nc : void 0;
  }
});

// node_modules/@noble/hashes/esm/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function anumber(n) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("positive integer expected, got " + n);
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function ahash(h) {
  if (typeof h !== "function" || typeof h.create !== "function")
    throw new Error("Hash should be wrapped by utils.createHasher");
  anumber(h.outputLen);
  anumber(h.blockLen);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function u32(arr) {
  return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
function byteSwap(word) {
  return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
}
function byteSwap32(arr) {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = byteSwap(arr[i]);
  }
  return arr;
}
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
function asciiToBase16(ch) {
  if (ch >= asciis._0 && ch <= asciis._9)
    return ch - asciis._0;
  if (ch >= asciis.A && ch <= asciis.F)
    return ch - (asciis.A - 10);
  if (ch >= asciis.a && ch <= asciis.f)
    return ch - (asciis.a - 10);
  return;
}
function hexToBytes(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  if (hasHexBuiltin)
    return Uint8Array.fromHex(hex);
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    throw new Error("hex string expected, got unpadded hex of length " + hl);
  const array = new Uint8Array(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = asciiToBase16(hex.charCodeAt(hi));
    const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n2 === void 0) {
      const char = hex[hi] + hex[hi + 1];
      throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
    }
    array[ai] = n1 * 16 + n2;
  }
  return array;
}
function utf8ToBytes(str3) {
  if (typeof str3 !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str3));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
function concatBytes(...arrays) {
  let sum = 0;
  for (let i = 0; i < arrays.length; i++) {
    const a = arrays[i];
    abytes(a);
    sum += a.length;
  }
  const res = new Uint8Array(sum);
  for (let i = 0, pad = 0; i < arrays.length; i++) {
    const a = arrays[i];
    res.set(a, pad);
    pad += a.length;
  }
  return res;
}
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}
function randomBytes(bytesLength = 32) {
  if (crypto3 && typeof crypto3.getRandomValues === "function") {
    return crypto3.getRandomValues(new Uint8Array(bytesLength));
  }
  if (crypto3 && typeof crypto3.randomBytes === "function") {
    return Uint8Array.from(crypto3.randomBytes(bytesLength));
  }
  throw new Error("crypto.getRandomValues must be defined");
}
var isLE, swap32IfBE, hasHexBuiltin, hexes, asciis, Hash;
var init_utils = __esm({
  "node_modules/@noble/hashes/esm/utils.js"() {
    init_cryptoNode();
    isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
    swap32IfBE = isLE ? (u) => u : byteSwap32;
    hasHexBuiltin = /* @__PURE__ */ (() => (
      // @ts-ignore
      typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
    ))();
    hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
    asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
    Hash = class {
    };
  }
});

// node_modules/@noble/hashes/esm/_md.js
function setBigUint64(view, byteOffset, value3, isLE2) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value3, isLE2);
  const _32n2 = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value3 >> _32n2 & _u32_max);
  const wl = Number(value3 & _u32_max);
  const h = isLE2 ? 4 : 0;
  const l = isLE2 ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE2);
  view.setUint32(byteOffset + l, wl, isLE2);
}
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD, SHA256_IV;
var init_md = __esm({
  "node_modules/@noble/hashes/esm/_md.js"() {
    init_utils();
    HashMD = class extends Hash {
      constructor(blockLen, outputLen, padOffset, isLE2) {
        super();
        this.finished = false;
        this.length = 0;
        this.pos = 0;
        this.destroyed = false;
        this.blockLen = blockLen;
        this.outputLen = outputLen;
        this.padOffset = padOffset;
        this.isLE = isLE2;
        this.buffer = new Uint8Array(blockLen);
        this.view = createView(this.buffer);
      }
      update(data) {
        aexists(this);
        data = toBytes(data);
        abytes(data);
        const { view, buffer, blockLen } = this;
        const len = data.length;
        for (let pos = 0; pos < len; ) {
          const take = Math.min(blockLen - this.pos, len - pos);
          if (take === blockLen) {
            const dataView = createView(data);
            for (; blockLen <= len - pos; pos += blockLen)
              this.process(dataView, pos);
            continue;
          }
          buffer.set(data.subarray(pos, pos + take), this.pos);
          this.pos += take;
          pos += take;
          if (this.pos === blockLen) {
            this.process(view, 0);
            this.pos = 0;
          }
        }
        this.length += data.length;
        this.roundClean();
        return this;
      }
      digestInto(out) {
        aexists(this);
        aoutput(out, this);
        this.finished = true;
        const { buffer, view, blockLen, isLE: isLE2 } = this;
        let { pos } = this;
        buffer[pos++] = 128;
        clean(this.buffer.subarray(pos));
        if (this.padOffset > blockLen - pos) {
          this.process(view, 0);
          pos = 0;
        }
        for (let i = pos; i < blockLen; i++)
          buffer[i] = 0;
        setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE2);
        this.process(view, 0);
        const oview = createView(out);
        const len = this.outputLen;
        if (len % 4)
          throw new Error("_sha2: outputLen should be aligned to 32bit");
        const outLen = len / 4;
        const state = this.get();
        if (outLen > state.length)
          throw new Error("_sha2: outputLen bigger than state");
        for (let i = 0; i < outLen; i++)
          oview.setUint32(4 * i, state[i], isLE2);
      }
      digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
      }
      _cloneInto(to) {
        to || (to = new this.constructor());
        to.set(...this.get());
        const { blockLen, buffer, length, finished, destroyed, pos } = this;
        to.destroyed = destroyed;
        to.finished = finished;
        to.length = length;
        to.pos = pos;
        if (length % blockLen)
          to.buffer.set(buffer);
        return to;
      }
      clone() {
        return this._cloneInto();
      }
    };
    SHA256_IV = /* @__PURE__ */ Uint32Array.from([
      1779033703,
      3144134277,
      1013904242,
      2773480762,
      1359893119,
      2600822924,
      528734635,
      1541459225
    ]);
  }
});

// node_modules/@noble/hashes/esm/_u64.js
function fromBig(n, le = false) {
  if (le)
    return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
  return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
  const len = lst.length;
  let Ah = new Uint32Array(len);
  let Al = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const { h, l } = fromBig(lst[i], le);
    [Ah[i], Al[i]] = [h, l];
  }
  return [Ah, Al];
}
var U32_MASK64, _32n, rotlSH, rotlSL, rotlBH, rotlBL;
var init_u64 = __esm({
  "node_modules/@noble/hashes/esm/_u64.js"() {
    U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
    _32n = /* @__PURE__ */ BigInt(32);
    rotlSH = (h, l, s) => h << s | l >>> 32 - s;
    rotlSL = (h, l, s) => l << s | h >>> 32 - s;
    rotlBH = (h, l, s) => l << s - 32 | h >>> 64 - s;
    rotlBL = (h, l, s) => h << s - 32 | l >>> 64 - s;
  }
});

// node_modules/@noble/hashes/esm/sha2.js
var SHA256_K, SHA256_W, SHA256, sha256;
var init_sha2 = __esm({
  "node_modules/@noble/hashes/esm/sha2.js"() {
    init_md();
    init_utils();
    SHA256_K = /* @__PURE__ */ Uint32Array.from([
      1116352408,
      1899447441,
      3049323471,
      3921009573,
      961987163,
      1508970993,
      2453635748,
      2870763221,
      3624381080,
      310598401,
      607225278,
      1426881987,
      1925078388,
      2162078206,
      2614888103,
      3248222580,
      3835390401,
      4022224774,
      264347078,
      604807628,
      770255983,
      1249150122,
      1555081692,
      1996064986,
      2554220882,
      2821834349,
      2952996808,
      3210313671,
      3336571891,
      3584528711,
      113926993,
      338241895,
      666307205,
      773529912,
      1294757372,
      1396182291,
      1695183700,
      1986661051,
      2177026350,
      2456956037,
      2730485921,
      2820302411,
      3259730800,
      3345764771,
      3516065817,
      3600352804,
      4094571909,
      275423344,
      430227734,
      506948616,
      659060556,
      883997877,
      958139571,
      1322822218,
      1537002063,
      1747873779,
      1955562222,
      2024104815,
      2227730452,
      2361852424,
      2428436474,
      2756734187,
      3204031479,
      3329325298
    ]);
    SHA256_W = /* @__PURE__ */ new Uint32Array(64);
    SHA256 = class extends HashMD {
      constructor(outputLen = 32) {
        super(64, outputLen, 8, false);
        this.A = SHA256_IV[0] | 0;
        this.B = SHA256_IV[1] | 0;
        this.C = SHA256_IV[2] | 0;
        this.D = SHA256_IV[3] | 0;
        this.E = SHA256_IV[4] | 0;
        this.F = SHA256_IV[5] | 0;
        this.G = SHA256_IV[6] | 0;
        this.H = SHA256_IV[7] | 0;
      }
      get() {
        const { A, B, C, D, E, F, G, H } = this;
        return [A, B, C, D, E, F, G, H];
      }
      // prettier-ignore
      set(A, B, C, D, E, F, G, H) {
        this.A = A | 0;
        this.B = B | 0;
        this.C = C | 0;
        this.D = D | 0;
        this.E = E | 0;
        this.F = F | 0;
        this.G = G | 0;
        this.H = H | 0;
      }
      process(view, offset) {
        for (let i = 0; i < 16; i++, offset += 4)
          SHA256_W[i] = view.getUint32(offset, false);
        for (let i = 16; i < 64; i++) {
          const W15 = SHA256_W[i - 15];
          const W2 = SHA256_W[i - 2];
          const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
          const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
          SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
        }
        let { A, B, C, D, E, F, G, H } = this;
        for (let i = 0; i < 64; i++) {
          const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
          const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
          const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
          const T2 = sigma0 + Maj(A, B, C) | 0;
          H = G;
          G = F;
          F = E;
          E = D + T1 | 0;
          D = C;
          C = B;
          B = A;
          A = T1 + T2 | 0;
        }
        A = A + this.A | 0;
        B = B + this.B | 0;
        C = C + this.C | 0;
        D = D + this.D | 0;
        E = E + this.E | 0;
        F = F + this.F | 0;
        G = G + this.G | 0;
        H = H + this.H | 0;
        this.set(A, B, C, D, E, F, G, H);
      }
      roundClean() {
        clean(SHA256_W);
      }
      destroy() {
        this.set(0, 0, 0, 0, 0, 0, 0, 0);
        clean(this.buffer);
      }
    };
    sha256 = /* @__PURE__ */ createHasher(() => new SHA256());
  }
});

// node_modules/@noble/hashes/esm/hmac.js
var HMAC, hmac;
var init_hmac = __esm({
  "node_modules/@noble/hashes/esm/hmac.js"() {
    init_utils();
    HMAC = class extends Hash {
      constructor(hash, _key) {
        super();
        this.finished = false;
        this.destroyed = false;
        ahash(hash);
        const key = toBytes(_key);
        this.iHash = hash.create();
        if (typeof this.iHash.update !== "function")
          throw new Error("Expected instance of class which extends utils.Hash");
        this.blockLen = this.iHash.blockLen;
        this.outputLen = this.iHash.outputLen;
        const blockLen = this.blockLen;
        const pad = new Uint8Array(blockLen);
        pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
        for (let i = 0; i < pad.length; i++)
          pad[i] ^= 54;
        this.iHash.update(pad);
        this.oHash = hash.create();
        for (let i = 0; i < pad.length; i++)
          pad[i] ^= 54 ^ 92;
        this.oHash.update(pad);
        clean(pad);
      }
      update(buf) {
        aexists(this);
        this.iHash.update(buf);
        return this;
      }
      digestInto(out) {
        aexists(this);
        abytes(out, this.outputLen);
        this.finished = true;
        this.iHash.digestInto(out);
        this.oHash.update(out);
        this.oHash.digestInto(out);
        this.destroy();
      }
      digest() {
        const out = new Uint8Array(this.oHash.outputLen);
        this.digestInto(out);
        return out;
      }
      _cloneInto(to) {
        to || (to = Object.create(Object.getPrototypeOf(this), {}));
        const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
        to = to;
        to.finished = finished;
        to.destroyed = destroyed;
        to.blockLen = blockLen;
        to.outputLen = outputLen;
        to.oHash = oHash._cloneInto(to.oHash);
        to.iHash = iHash._cloneInto(to.iHash);
        return to;
      }
      clone() {
        return this._cloneInto();
      }
      destroy() {
        this.destroyed = true;
        this.oHash.destroy();
        this.iHash.destroy();
      }
    };
    hmac = (hash, key, message) => new HMAC(hash, key).update(message).digest();
    hmac.create = (hash, key) => new HMAC(hash, key);
  }
});

// node_modules/@noble/hashes/esm/sha3.js
function keccakP(s, rounds = 24) {
  const B = new Uint32Array(5 * 2);
  for (let round = 24 - rounds; round < 24; round++) {
    for (let x = 0; x < 10; x++)
      B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
    for (let x = 0; x < 10; x += 2) {
      const idx1 = (x + 8) % 10;
      const idx0 = (x + 2) % 10;
      const B0 = B[idx0];
      const B1 = B[idx0 + 1];
      const Th = rotlH(B0, B1, 1) ^ B[idx1];
      const Tl = rotlL(B0, B1, 1) ^ B[idx1 + 1];
      for (let y = 0; y < 50; y += 10) {
        s[x + y] ^= Th;
        s[x + y + 1] ^= Tl;
      }
    }
    let curH = s[2];
    let curL = s[3];
    for (let t = 0; t < 24; t++) {
      const shift = SHA3_ROTL[t];
      const Th = rotlH(curH, curL, shift);
      const Tl = rotlL(curH, curL, shift);
      const PI = SHA3_PI[t];
      curH = s[PI];
      curL = s[PI + 1];
      s[PI] = Th;
      s[PI + 1] = Tl;
    }
    for (let y = 0; y < 50; y += 10) {
      for (let x = 0; x < 10; x++)
        B[x] = s[y + x];
      for (let x = 0; x < 10; x++)
        s[y + x] ^= ~B[(x + 2) % 10] & B[(x + 4) % 10];
    }
    s[0] ^= SHA3_IOTA_H[round];
    s[1] ^= SHA3_IOTA_L[round];
  }
  clean(B);
}
var _0n5, _1n5, _2n4, _7n2, _256n, _0x71n, SHA3_PI, SHA3_ROTL, _SHA3_IOTA, IOTAS, SHA3_IOTA_H, SHA3_IOTA_L, rotlH, rotlL, Keccak, gen, keccak_256;
var init_sha3 = __esm({
  "node_modules/@noble/hashes/esm/sha3.js"() {
    init_u64();
    init_utils();
    _0n5 = BigInt(0);
    _1n5 = BigInt(1);
    _2n4 = BigInt(2);
    _7n2 = BigInt(7);
    _256n = BigInt(256);
    _0x71n = BigInt(113);
    SHA3_PI = [];
    SHA3_ROTL = [];
    _SHA3_IOTA = [];
    for (let round = 0, R = _1n5, x = 1, y = 0; round < 24; round++) {
      [x, y] = [y, (2 * x + 3 * y) % 5];
      SHA3_PI.push(2 * (5 * y + x));
      SHA3_ROTL.push((round + 1) * (round + 2) / 2 % 64);
      let t = _0n5;
      for (let j = 0; j < 7; j++) {
        R = (R << _1n5 ^ (R >> _7n2) * _0x71n) % _256n;
        if (R & _2n4)
          t ^= _1n5 << (_1n5 << /* @__PURE__ */ BigInt(j)) - _1n5;
      }
      _SHA3_IOTA.push(t);
    }
    IOTAS = split(_SHA3_IOTA, true);
    SHA3_IOTA_H = IOTAS[0];
    SHA3_IOTA_L = IOTAS[1];
    rotlH = (h, l, s) => s > 32 ? rotlBH(h, l, s) : rotlSH(h, l, s);
    rotlL = (h, l, s) => s > 32 ? rotlBL(h, l, s) : rotlSL(h, l, s);
    Keccak = class _Keccak extends Hash {
      // NOTE: we accept arguments in bytes instead of bits here.
      constructor(blockLen, suffix, outputLen, enableXOF = false, rounds = 24) {
        super();
        this.pos = 0;
        this.posOut = 0;
        this.finished = false;
        this.destroyed = false;
        this.enableXOF = false;
        this.blockLen = blockLen;
        this.suffix = suffix;
        this.outputLen = outputLen;
        this.enableXOF = enableXOF;
        this.rounds = rounds;
        anumber(outputLen);
        if (!(0 < blockLen && blockLen < 200))
          throw new Error("only keccak-f1600 function is supported");
        this.state = new Uint8Array(200);
        this.state32 = u32(this.state);
      }
      clone() {
        return this._cloneInto();
      }
      keccak() {
        swap32IfBE(this.state32);
        keccakP(this.state32, this.rounds);
        swap32IfBE(this.state32);
        this.posOut = 0;
        this.pos = 0;
      }
      update(data) {
        aexists(this);
        data = toBytes(data);
        abytes(data);
        const { blockLen, state } = this;
        const len = data.length;
        for (let pos = 0; pos < len; ) {
          const take = Math.min(blockLen - this.pos, len - pos);
          for (let i = 0; i < take; i++)
            state[this.pos++] ^= data[pos++];
          if (this.pos === blockLen)
            this.keccak();
        }
        return this;
      }
      finish() {
        if (this.finished)
          return;
        this.finished = true;
        const { state, suffix, pos, blockLen } = this;
        state[pos] ^= suffix;
        if ((suffix & 128) !== 0 && pos === blockLen - 1)
          this.keccak();
        state[blockLen - 1] ^= 128;
        this.keccak();
      }
      writeInto(out) {
        aexists(this, false);
        abytes(out);
        this.finish();
        const bufferOut = this.state;
        const { blockLen } = this;
        for (let pos = 0, len = out.length; pos < len; ) {
          if (this.posOut >= blockLen)
            this.keccak();
          const take = Math.min(blockLen - this.posOut, len - pos);
          out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
          this.posOut += take;
          pos += take;
        }
        return out;
      }
      xofInto(out) {
        if (!this.enableXOF)
          throw new Error("XOF is not possible for this instance");
        return this.writeInto(out);
      }
      xof(bytes) {
        anumber(bytes);
        return this.xofInto(new Uint8Array(bytes));
      }
      digestInto(out) {
        aoutput(out, this);
        if (this.finished)
          throw new Error("digest() was already called");
        this.writeInto(out);
        this.destroy();
        return out;
      }
      digest() {
        return this.digestInto(new Uint8Array(this.outputLen));
      }
      destroy() {
        this.destroyed = true;
        clean(this.state);
      }
      _cloneInto(to) {
        const { blockLen, suffix, outputLen, rounds, enableXOF } = this;
        to || (to = new _Keccak(blockLen, suffix, outputLen, enableXOF, rounds));
        to.state32.set(this.state32);
        to.pos = this.pos;
        to.posOut = this.posOut;
        to.finished = this.finished;
        to.rounds = rounds;
        to.suffix = suffix;
        to.outputLen = outputLen;
        to.enableXOF = enableXOF;
        to.destroyed = this.destroyed;
        return to;
      }
    };
    gen = (suffix, blockLen, outputLen) => createHasher(() => new Keccak(blockLen, suffix, outputLen));
    keccak_256 = /* @__PURE__ */ (() => gen(1, 136, 256 / 8))();
  }
});

// src/lib/config.ts
import fs from "node:fs";

// src/lib/paths.ts
import os from "node:os";
import path from "node:path";
var DATA_DIR = path.join(os.homedir(), ".rickydata");
var CONFIG_FILE = path.join(DATA_DIR, "config.json");
var DERIVE_SESSION_FILE = path.join(DATA_DIR, "derive-session.json");
var STATE_DIR = path.join(DATA_DIR, "state", "rd-plugin");
var STATE_FILE = path.join(STATE_DIR, "state.json");
var PENDING_DIR = path.join(STATE_DIR, "pending");
var QUEUE_DIR = path.join(DATA_DIR, "queue", "rd-plugin");
var QUEUE_DEAD_DIR = path.join(DATA_DIR, "queue-failed", "rd-plugin");
var LOG_FILE = path.join(DATA_DIR, "logs", "rd-plugin.log");
function pendingFileFor(claudeSessionId) {
  return path.join(PENDING_DIR, `${safeName(claudeSessionId)}.jsonl`);
}
function safeName(value3) {
  return String(value3 || "unknown").replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 200);
}

// src/lib/config.ts
var DEFAULT_API_URL = "http://34.60.37.158";
var DEFAULT_HOME_URL = "https://rickydata-home-2dbp4scmrq-uc.a.run.app";
function readRawConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function asBool(value3, fallback) {
  return typeof value3 === "boolean" ? value3 : fallback;
}
function asStringArray(value3) {
  return Array.isArray(value3) ? value3.filter((v) => typeof v === "string") : [];
}
function loadConfig() {
  const raw = readRawConfig();
  const private_key = typeof raw.private_key === "string" ? raw.private_key : void 0;
  const api_url = process.env.RICKYDATA_API_URL || typeof raw.api_url === "string" && raw.api_url || DEFAULT_API_URL;
  const home_url = process.env.RICKYDATA_HOME_URL || typeof raw.home_url === "string" && raw.home_url || DEFAULT_HOME_URL;
  return {
    api_url,
    home_url,
    api_key: typeof raw.api_key === "string" ? raw.api_key : void 0,
    private_key,
    // `enabled` is the user kill-switch and defaults on. The "do nothing when
    // there is no usable config" behavior is provided by resolveSink() returning
    // 'off' (which the hooks check first) — NOT by this flag. Defaulting to
    // Boolean(private_key) here would wrongly disable gateway-sink mode, where
    // there is no local private_key but tracking must still run.
    enabled: asBool(raw.enabled, true),
    excluded_directories: asStringArray(raw.excluded_directories),
    sink: raw.sink === "direct" || raw.sink === "gateway" || raw.sink === "off" ? raw.sink : void 0,
    track_messages: asBool(raw.track_messages, true),
    track_files: asBool(raw.track_files, true),
    track_git: asBool(raw.track_git, true),
    log_level: typeof raw.log_level === "string" ? raw.log_level : "info"
  };
}
function resolveSink(config, env = process.env) {
  const fromEnv = env.RICKYDATA_KG_SINK;
  if (fromEnv === "direct" || fromEnv === "gateway" || fromEnv === "off") {
    return fromEnv;
  }
  if (config.sink) {
    return config.sink;
  }
  return config.private_key ? "direct" : "off";
}

// src/lib/log.ts
import fs2 from "node:fs";
import path2 from "node:path";
var LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
var currentLevel = "info";
function setLogLevel(level) {
  if (level in LEVELS) currentLevel = level;
}
function log(level, message, fields = {}) {
  try {
    if ((LEVELS[level] ?? 1) < (LEVELS[currentLevel] ?? 1)) return;
    const entry = JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), level, message, ...fields });
    fs2.mkdirSync(path2.dirname(LOG_FILE), { recursive: true });
    fs2.appendFileSync(LOG_FILE, `${entry}
`, { mode: 384 });
  } catch {
  }
}

// src/lib/pending.ts
import fs3 from "node:fs";

// src/lib/work-provenance.ts
var WORK_PROVENANCE_SCHEMA_VERSION = "rickydata.work_provenance.v1";
function record(value3) {
  return value3 && typeof value3 === "object" && !Array.isArray(value3) ? value3 : {};
}
function sdkHookPayload(payload, provenance) {
  if (!provenance) return payload;
  return { ...record(payload), rickydata_work_provenance: provenance };
}
function normalizeWorkProvenance(value3) {
  const item = record(value3);
  return item.schemaVersion === WORK_PROVENANCE_SCHEMA_VERSION ? item : void 0;
}

// src/lib/event.ts
function str(value3) {
  return typeof value3 === "string" ? value3 : void 0;
}
function normalizePendingEvent(raw, index) {
  const e = raw && typeof raw === "object" ? raw : {};
  return {
    sequence: typeof e.sequence === "number" ? e.sequence : index,
    hookEventName: str(e.hookEventName) ?? "Unknown",
    claudeSessionId: str(e.claudeSessionId) ?? "unknown",
    transcriptPath: str(e.transcriptPath),
    cwd: str(e.cwd),
    model: str(e.model),
    source: str(e.source),
    receivedAt: typeof e.receivedAt === "number" ? e.receivedAt : Date.now(),
    prompt: str(e.prompt),
    reason: str(e.reason),
    stopHookActive: typeof e.stopHookActive === "boolean" ? e.stopHookActive : void 0,
    toolName: str(e.toolName),
    toolUseId: str(e.toolUseId),
    toolInput: e.toolInput,
    toolResponse: e.toolResponse,
    permissionDecision: str(e.permissionDecision),
    permissionDecisionReason: str(e.permissionDecisionReason),
    lastAssistantMessage: typeof e.lastAssistantMessage === "string" ? e.lastAssistantMessage : e.lastAssistantMessage === null ? null : void 0,
    hookPayload: e.hookPayload,
    decisionKind: e.decisionKind === "ask_user" || e.decisionKind === "tool_permission" ? e.decisionKind : void 0,
    decisionQuestion: str(e.decisionQuestion),
    decisionOptions: Array.isArray(e.decisionOptions) ? e.decisionOptions.filter((item) => typeof item === "string") : void 0,
    decisionAnswer: str(e.decisionAnswer),
    decisionPolicyRef: str(e.decisionPolicyRef),
    repository: e.repository && typeof e.repository === "object" ? e.repository : void 0,
    workProvenance: normalizeWorkProvenance(e.workProvenance),
    workContract: e.workContract && typeof e.workContract === "object" ? e.workContract : void 0,
    sourceIntentRef: str(e.sourceIntentRef),
    contextDelivery: e.contextDelivery && typeof e.contextDelivery === "object" ? e.contextDelivery : void 0
  };
}

// src/lib/pending.ts
function readPending(claudeSessionId) {
  let raw;
  try {
    raw = fs3.readFileSync(pendingFileFor(claudeSessionId), "utf8");
  } catch {
    return [];
  }
  return raw.split("\n").filter((line) => line.trim()).map((line, index) => {
    try {
      return normalizePendingEvent(JSON.parse(line), index);
    } catch {
      return normalizePendingEvent({}, index);
    }
  }).sort((a, b) => a.sequence - b.sequence);
}
function clearPending(claudeSessionId) {
  try {
    fs3.rmSync(pendingFileFor(claudeSessionId), { force: true });
  } catch {
  }
}

// src/lib/fsutil.ts
import fs4 from "node:fs";
import path3 from "node:path";
import crypto2 from "node:crypto";
function sha256Hex(input) {
  return crypto2.createHash("sha256").update(input).digest("hex");
}
function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs4.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}
function writeJsonFileAtomic(filePath, data) {
  fs4.mkdirSync(path3.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;
  fs4.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 384 });
  fs4.renameSync(tmp, filePath);
}
function writeFileAtomic(filePath, body) {
  fs4.mkdirSync(path3.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;
  fs4.writeFileSync(tmp, body, { mode: 384 });
  fs4.renameSync(tmp, filePath);
}

// src/lib/flush-lock.ts
import fs5 from "node:fs";
import path4 from "node:path";
var FLUSH_LOCK_STALE_MS = 10 * 60 * 1e3;
function lockPath(dir, sessionId) {
  const safe = sessionId.replace(/[^A-Za-z0-9_.-]/g, "_");
  return path4.join(dir, `${safe}.flush.lock`);
}
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
function holderIsLive(dir, sessionId) {
  try {
    const body = JSON.parse(fs5.readFileSync(lockPath(dir, sessionId), "utf8"));
    const fresh = typeof body.startedAt === "number" && Date.now() - body.startedAt < FLUSH_LOCK_STALE_MS;
    const alive = typeof body.pid === "number" && body.pid > 0 && pidAlive(body.pid);
    return fresh && alive;
  } catch {
    return false;
  }
}
function acquireFlushLock(dir, sessionId) {
  const file = lockPath(dir, sessionId);
  const body = JSON.stringify({ pid: process.pid, startedAt: Date.now() });
  try {
    fs5.mkdirSync(dir, { recursive: true });
    fs5.writeFileSync(file, body, { flag: "wx", mode: 384 });
    return true;
  } catch {
    if (holderIsLive(dir, sessionId)) return false;
    try {
      fs5.writeFileSync(file, body, { mode: 384 });
    } catch {
    }
    return true;
  }
}
async function acquireFlushLockOrWait(dir, sessionId, maxWaitMs = 2e4) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (acquireFlushLock(dir, sessionId)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  try {
    fs5.writeFileSync(lockPath(dir, sessionId), JSON.stringify({ pid: process.pid, startedAt: Date.now() }), { mode: 384 });
  } catch {
  }
}
function releaseFlushLock(dir, sessionId) {
  const file = lockPath(dir, sessionId);
  try {
    const body = JSON.parse(fs5.readFileSync(file, "utf8"));
    if (body.pid === process.pid) fs5.rmSync(file, { force: true });
  } catch {
  }
}

// src/lib/state.ts
function readState() {
  const state = readJsonFile(STATE_FILE, { flushed: {} });
  if (!state.flushed || typeof state.flushed !== "object") state.flushed = {};
  return state;
}
function writeState(state) {
  writeJsonFileAtomic(STATE_FILE, state);
}
function flushedEntry(state, sessionId) {
  return state.flushed[sessionId] ?? {};
}
function setFlushedEntry(state, sessionId, entry) {
  state.flushed[sessionId] = { ...flushedEntry(state, sessionId), ...entry, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
}
async function updateStateLocked(mutate) {
  await acquireFlushLockOrWait(STATE_DIR, "state", 1e4);
  try {
    const state = readState();
    mutate(state);
    writeState(state);
  } finally {
    releaseFlushLock(STATE_DIR, "state");
  }
}
async function commitFlushedEntry(sessionId, entry) {
  await updateStateLocked((state) => setFlushedEntry(state, sessionId, entry));
}
function computeFingerprint(claudeSessionId, sink, events) {
  const shape = events.map((e) => `${e.sequence}:${e.hookEventName}:${e.toolUseId ?? ""}`).join("|");
  return sha256Hex(`${claudeSessionId} ${sink} ${events.length} ${shape}`);
}

// src/lib/transcript.ts
import fs6 from "node:fs";
import os2 from "node:os";
import path5 from "node:path";
var FILE_EDIT_TOOLS = /* @__PURE__ */ new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
var PLAN_FILE_RE = /[\\/]\.claude[\\/]plans[\\/][^\\/]+\.md$/;
function readLines(transcriptPath) {
  let raw;
  try {
    raw = fs6.readFileSync(transcriptPath, "utf8");
  } catch {
    return [];
  }
  const entries = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
    }
  }
  return entries;
}
function contentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((b) => !!b && typeof b === "object").filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n");
  }
  return "";
}
function isRealUserPrompt(entry) {
  if (entry.type !== "user" || entry.isMeta) return null;
  const content = entry.message?.content;
  if (Array.isArray(content) && content.some((b) => b && typeof b === "object" && b.type === "tool_result")) {
    return null;
  }
  const text = contentText(content).trim();
  if (!text) return null;
  if (/^<(local-command|command-name|command-message|command-args|command-stdout)/.test(text)) return null;
  return text;
}
function parseTranscriptSummary(transcriptPath) {
  const entries = readLines(transcriptPath);
  const summary = { messageCount: 0, filesChanged: 0 };
  const changedFiles = /* @__PURE__ */ new Set();
  const seenUuids = /* @__PURE__ */ new Set();
  const plansByPath = /* @__PURE__ */ new Map();
  let pathlessPlan;
  let currentPlanPath;
  let lastTs;
  const planForPath = (planFilePath) => {
    let plan = plansByPath.get(planFilePath);
    if (!plan) {
      plan = { planFilePath };
      plansByPath.set(planFilePath, plan);
      if (pathlessPlan?.content && !plan.content) {
        plan.content = pathlessPlan.content;
        plan.updatedAt = pathlessPlan.updatedAt;
        pathlessPlan = void 0;
      }
    }
    currentPlanPath = planFilePath;
    return plan;
  };
  const recordPlanContent = (content) => {
    const target = currentPlanPath ? planForPath(currentPlanPath) : pathlessPlan ??= {};
    target.content = content;
    target.updatedAt = lastTs;
  };
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!summary.claudeSessionId && typeof entry.sessionId === "string") summary.claudeSessionId = entry.sessionId;
    if (!summary.cwd && typeof entry.cwd === "string") summary.cwd = entry.cwd;
    if (typeof entry.timestamp === "string") {
      const t = Date.parse(entry.timestamp);
      if (!Number.isNaN(t)) lastTs = t;
    }
    if (entry.type === "attachment" && entry.attachment?.type === "plan_mode" && typeof entry.attachment.planFilePath === "string") {
      const plan = planForPath(entry.attachment.planFilePath);
      if (plan.updatedAt === void 0) plan.updatedAt = lastTs;
    }
    if (summary.parentSessionId === void 0 && i < 40) {
      if (typeof entry.parentSessionId === "string") summary.parentSessionId = entry.parentSessionId;
      else if (typeof entry.parentUuid === "string" && !seenUuids.has(entry.parentUuid)) summary.parentSessionId = entry.parentUuid;
    }
    if (typeof entry.uuid === "string") seenUuids.add(entry.uuid);
    if (entry.type === "user" || entry.type === "assistant") summary.messageCount += 1;
    if (!summary.initialPrompt) {
      const prompt = isRealUserPrompt(entry);
      if (prompt) summary.initialPrompt = prompt;
    }
    if (entry.type === "assistant") {
      if (typeof entry.message?.model === "string" && entry.message.model) summary.model = entry.message.model;
      const content = entry.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== "object") continue;
          const b = block;
          if (b.type !== "tool_use" || !b.name) continue;
          if (FILE_EDIT_TOOLS.has(b.name)) {
            const fp = b.input?.file_path ?? b.input?.path;
            if (typeof fp === "string" && fp) {
              changedFiles.add(fp);
              if (PLAN_FILE_RE.test(fp)) {
                const plan = planForPath(fp);
                plan.updatedAt = lastTs;
                if (b.name === "Write" && typeof b.input?.content === "string") plan.content = b.input.content;
              }
            }
          } else if (b.name === "ExitPlanMode" && typeof b.input?.plan === "string" && b.input.plan.trim()) {
            recordPlanContent(b.input.plan);
          }
        }
      }
    }
  }
  summary.filesChanged = changedFiles.size;
  const plans = [...plansByPath.values(), ...pathlessPlan?.content ? [pathlessPlan] : []];
  if (plans.length > 0) summary.plans = plans;
  return summary;
}
function findTranscriptForSession(claudeSessionId) {
  const projectsDir = path5.join(os2.homedir(), ".claude", "projects");
  try {
    const stack = [projectsDir];
    while (stack.length > 0) {
      const dir = stack.pop();
      let dirents;
      try {
        dirents = fs6.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const dirent of dirents) {
        const full = path5.join(dir, dirent.name);
        if (dirent.isDirectory()) stack.push(full);
        else if (dirent.isFile() && dirent.name === `${claudeSessionId}.jsonl`) return full;
      }
    }
  } catch {
  }
  return void 0;
}

// src/lib/derive.ts
import crypto4 from "node:crypto";

// node_modules/@noble/curves/esm/secp256k1.js
init_sha2();

// node_modules/@noble/curves/esm/abstract/weierstrass.js
init_hmac();
init_utils();

// node_modules/@noble/curves/esm/utils.js
init_utils();
init_utils();
var _0n = /* @__PURE__ */ BigInt(0);
var _1n = /* @__PURE__ */ BigInt(1);
function _abool2(value3, title = "") {
  if (typeof value3 !== "boolean") {
    const prefix = title && `"${title}"`;
    throw new Error(prefix + "expected boolean, got type=" + typeof value3);
  }
  return value3;
}
function _abytes2(value3, length, title = "") {
  const bytes = isBytes(value3);
  const len = value3?.length;
  const needsLen = length !== void 0;
  if (!bytes || needsLen && len !== length) {
    const prefix = title && `"${title}" `;
    const ofLen = needsLen ? ` of length ${length}` : "";
    const got = bytes ? `length=${len}` : `type=${typeof value3}`;
    throw new Error(prefix + "expected Uint8Array" + ofLen + ", got " + got);
  }
  return value3;
}
function numberToHexUnpadded(num) {
  const hex = num.toString(16);
  return hex.length & 1 ? "0" + hex : hex;
}
function hexToNumber(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  return hex === "" ? _0n : BigInt("0x" + hex);
}
function bytesToNumberBE(bytes) {
  return hexToNumber(bytesToHex(bytes));
}
function bytesToNumberLE(bytes) {
  abytes(bytes);
  return hexToNumber(bytesToHex(Uint8Array.from(bytes).reverse()));
}
function numberToBytesBE(n, len) {
  return hexToBytes(n.toString(16).padStart(len * 2, "0"));
}
function numberToBytesLE(n, len) {
  return numberToBytesBE(n, len).reverse();
}
function ensureBytes(title, hex, expectedLength) {
  let res;
  if (typeof hex === "string") {
    try {
      res = hexToBytes(hex);
    } catch (e) {
      throw new Error(title + " must be hex string or Uint8Array, cause: " + e);
    }
  } else if (isBytes(hex)) {
    res = Uint8Array.from(hex);
  } else {
    throw new Error(title + " must be hex string or Uint8Array");
  }
  const len = res.length;
  if (typeof expectedLength === "number" && len !== expectedLength)
    throw new Error(title + " of length " + expectedLength + " expected, got " + len);
  return res;
}
var isPosBig = (n) => typeof n === "bigint" && _0n <= n;
function inRange(n, min, max) {
  return isPosBig(n) && isPosBig(min) && isPosBig(max) && min <= n && n < max;
}
function aInRange(title, n, min, max) {
  if (!inRange(n, min, max))
    throw new Error("expected valid " + title + ": " + min + " <= n < " + max + ", got " + n);
}
function bitLen(n) {
  let len;
  for (len = 0; n > _0n; n >>= _1n, len += 1)
    ;
  return len;
}
var bitMask = (n) => (_1n << BigInt(n)) - _1n;
function createHmacDrbg(hashLen, qByteLen, hmacFn) {
  if (typeof hashLen !== "number" || hashLen < 2)
    throw new Error("hashLen must be a number");
  if (typeof qByteLen !== "number" || qByteLen < 2)
    throw new Error("qByteLen must be a number");
  if (typeof hmacFn !== "function")
    throw new Error("hmacFn must be a function");
  const u8n = (len) => new Uint8Array(len);
  const u8of = (byte) => Uint8Array.of(byte);
  let v = u8n(hashLen);
  let k = u8n(hashLen);
  let i = 0;
  const reset = () => {
    v.fill(1);
    k.fill(0);
    i = 0;
  };
  const h = (...b) => hmacFn(k, v, ...b);
  const reseed = (seed = u8n(0)) => {
    k = h(u8of(0), seed);
    v = h();
    if (seed.length === 0)
      return;
    k = h(u8of(1), seed);
    v = h();
  };
  const gen2 = () => {
    if (i++ >= 1e3)
      throw new Error("drbg: tried 1000 values");
    let len = 0;
    const out = [];
    while (len < qByteLen) {
      v = h();
      const sl = v.slice();
      out.push(sl);
      len += v.length;
    }
    return concatBytes(...out);
  };
  const genUntil = (seed, pred) => {
    reset();
    reseed(seed);
    let res = void 0;
    while (!(res = pred(gen2())))
      reseed();
    reset();
    return res;
  };
  return genUntil;
}
function _validateObject(object, fields, optFields = {}) {
  if (!object || typeof object !== "object")
    throw new Error("expected valid options object");
  function checkField(fieldName, expectedType, isOpt) {
    const val = object[fieldName];
    if (isOpt && val === void 0)
      return;
    const current = typeof val;
    if (current !== expectedType || val === null)
      throw new Error(`param "${fieldName}" is invalid: expected ${expectedType}, got ${current}`);
  }
  Object.entries(fields).forEach(([k, v]) => checkField(k, v, false));
  Object.entries(optFields).forEach(([k, v]) => checkField(k, v, true));
}
function memoized(fn) {
  const map = /* @__PURE__ */ new WeakMap();
  return (arg, ...args) => {
    const val = map.get(arg);
    if (val !== void 0)
      return val;
    const computed = fn(arg, ...args);
    map.set(arg, computed);
    return computed;
  };
}

// node_modules/@noble/curves/esm/abstract/modular.js
var _0n2 = BigInt(0);
var _1n2 = BigInt(1);
var _2n = /* @__PURE__ */ BigInt(2);
var _3n = /* @__PURE__ */ BigInt(3);
var _4n = /* @__PURE__ */ BigInt(4);
var _5n = /* @__PURE__ */ BigInt(5);
var _7n = /* @__PURE__ */ BigInt(7);
var _8n = /* @__PURE__ */ BigInt(8);
var _9n = /* @__PURE__ */ BigInt(9);
var _16n = /* @__PURE__ */ BigInt(16);
function mod(a, b) {
  const result = a % b;
  return result >= _0n2 ? result : b + result;
}
function pow2(x, power, modulo) {
  let res = x;
  while (power-- > _0n2) {
    res *= res;
    res %= modulo;
  }
  return res;
}
function invert(number, modulo) {
  if (number === _0n2)
    throw new Error("invert: expected non-zero number");
  if (modulo <= _0n2)
    throw new Error("invert: expected positive modulus, got " + modulo);
  let a = mod(number, modulo);
  let b = modulo;
  let x = _0n2, y = _1n2, u = _1n2, v = _0n2;
  while (a !== _0n2) {
    const q = b / a;
    const r = b % a;
    const m = x - u * q;
    const n = y - v * q;
    b = a, a = r, x = u, y = v, u = m, v = n;
  }
  const gcd = b;
  if (gcd !== _1n2)
    throw new Error("invert: does not exist");
  return mod(x, modulo);
}
function assertIsSquare(Fp, root, n) {
  if (!Fp.eql(Fp.sqr(root), n))
    throw new Error("Cannot find square root");
}
function sqrt3mod4(Fp, n) {
  const p1div4 = (Fp.ORDER + _1n2) / _4n;
  const root = Fp.pow(n, p1div4);
  assertIsSquare(Fp, root, n);
  return root;
}
function sqrt5mod8(Fp, n) {
  const p5div8 = (Fp.ORDER - _5n) / _8n;
  const n2 = Fp.mul(n, _2n);
  const v = Fp.pow(n2, p5div8);
  const nv = Fp.mul(n, v);
  const i = Fp.mul(Fp.mul(nv, _2n), v);
  const root = Fp.mul(nv, Fp.sub(i, Fp.ONE));
  assertIsSquare(Fp, root, n);
  return root;
}
function sqrt9mod16(P) {
  const Fp_ = Field(P);
  const tn = tonelliShanks(P);
  const c1 = tn(Fp_, Fp_.neg(Fp_.ONE));
  const c2 = tn(Fp_, c1);
  const c3 = tn(Fp_, Fp_.neg(c1));
  const c4 = (P + _7n) / _16n;
  return (Fp, n) => {
    let tv1 = Fp.pow(n, c4);
    let tv2 = Fp.mul(tv1, c1);
    const tv3 = Fp.mul(tv1, c2);
    const tv4 = Fp.mul(tv1, c3);
    const e1 = Fp.eql(Fp.sqr(tv2), n);
    const e2 = Fp.eql(Fp.sqr(tv3), n);
    tv1 = Fp.cmov(tv1, tv2, e1);
    tv2 = Fp.cmov(tv4, tv3, e2);
    const e3 = Fp.eql(Fp.sqr(tv2), n);
    const root = Fp.cmov(tv1, tv2, e3);
    assertIsSquare(Fp, root, n);
    return root;
  };
}
function tonelliShanks(P) {
  if (P < _3n)
    throw new Error("sqrt is not defined for small field");
  let Q = P - _1n2;
  let S = 0;
  while (Q % _2n === _0n2) {
    Q /= _2n;
    S++;
  }
  let Z = _2n;
  const _Fp = Field(P);
  while (FpLegendre(_Fp, Z) === 1) {
    if (Z++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  }
  if (S === 1)
    return sqrt3mod4;
  let cc = _Fp.pow(Z, Q);
  const Q1div2 = (Q + _1n2) / _2n;
  return function tonelliSlow(Fp, n) {
    if (Fp.is0(n))
      return n;
    if (FpLegendre(Fp, n) !== 1)
      throw new Error("Cannot find square root");
    let M = S;
    let c = Fp.mul(Fp.ONE, cc);
    let t = Fp.pow(n, Q);
    let R = Fp.pow(n, Q1div2);
    while (!Fp.eql(t, Fp.ONE)) {
      if (Fp.is0(t))
        return Fp.ZERO;
      let i = 1;
      let t_tmp = Fp.sqr(t);
      while (!Fp.eql(t_tmp, Fp.ONE)) {
        i++;
        t_tmp = Fp.sqr(t_tmp);
        if (i === M)
          throw new Error("Cannot find square root");
      }
      const exponent = _1n2 << BigInt(M - i - 1);
      const b = Fp.pow(c, exponent);
      M = i;
      c = Fp.sqr(b);
      t = Fp.mul(t, c);
      R = Fp.mul(R, b);
    }
    return R;
  };
}
function FpSqrt(P) {
  if (P % _4n === _3n)
    return sqrt3mod4;
  if (P % _8n === _5n)
    return sqrt5mod8;
  if (P % _16n === _9n)
    return sqrt9mod16(P);
  return tonelliShanks(P);
}
var FIELD_FIELDS = [
  "create",
  "isValid",
  "is0",
  "neg",
  "inv",
  "sqrt",
  "sqr",
  "eql",
  "add",
  "sub",
  "mul",
  "pow",
  "div",
  "addN",
  "subN",
  "mulN",
  "sqrN"
];
function validateField(field) {
  const initial = {
    ORDER: "bigint",
    MASK: "bigint",
    BYTES: "number",
    BITS: "number"
  };
  const opts = FIELD_FIELDS.reduce((map, val) => {
    map[val] = "function";
    return map;
  }, initial);
  _validateObject(field, opts);
  return field;
}
function FpPow(Fp, num, power) {
  if (power < _0n2)
    throw new Error("invalid exponent, negatives unsupported");
  if (power === _0n2)
    return Fp.ONE;
  if (power === _1n2)
    return num;
  let p = Fp.ONE;
  let d = num;
  while (power > _0n2) {
    if (power & _1n2)
      p = Fp.mul(p, d);
    d = Fp.sqr(d);
    power >>= _1n2;
  }
  return p;
}
function FpInvertBatch(Fp, nums, passZero = false) {
  const inverted = new Array(nums.length).fill(passZero ? Fp.ZERO : void 0);
  const multipliedAcc = nums.reduce((acc, num, i) => {
    if (Fp.is0(num))
      return acc;
    inverted[i] = acc;
    return Fp.mul(acc, num);
  }, Fp.ONE);
  const invertedAcc = Fp.inv(multipliedAcc);
  nums.reduceRight((acc, num, i) => {
    if (Fp.is0(num))
      return acc;
    inverted[i] = Fp.mul(acc, inverted[i]);
    return Fp.mul(acc, num);
  }, invertedAcc);
  return inverted;
}
function FpLegendre(Fp, n) {
  const p1mod2 = (Fp.ORDER - _1n2) / _2n;
  const powered = Fp.pow(n, p1mod2);
  const yes = Fp.eql(powered, Fp.ONE);
  const zero = Fp.eql(powered, Fp.ZERO);
  const no = Fp.eql(powered, Fp.neg(Fp.ONE));
  if (!yes && !zero && !no)
    throw new Error("invalid Legendre symbol result");
  return yes ? 1 : zero ? 0 : -1;
}
function nLength(n, nBitLength) {
  if (nBitLength !== void 0)
    anumber(nBitLength);
  const _nBitLength = nBitLength !== void 0 ? nBitLength : n.toString(2).length;
  const nByteLength = Math.ceil(_nBitLength / 8);
  return { nBitLength: _nBitLength, nByteLength };
}
function Field(ORDER, bitLenOrOpts, isLE2 = false, opts = {}) {
  if (ORDER <= _0n2)
    throw new Error("invalid field: expected ORDER > 0, got " + ORDER);
  let _nbitLength = void 0;
  let _sqrt = void 0;
  let modFromBytes = false;
  let allowedLengths = void 0;
  if (typeof bitLenOrOpts === "object" && bitLenOrOpts != null) {
    if (opts.sqrt || isLE2)
      throw new Error("cannot specify opts in two arguments");
    const _opts = bitLenOrOpts;
    if (_opts.BITS)
      _nbitLength = _opts.BITS;
    if (_opts.sqrt)
      _sqrt = _opts.sqrt;
    if (typeof _opts.isLE === "boolean")
      isLE2 = _opts.isLE;
    if (typeof _opts.modFromBytes === "boolean")
      modFromBytes = _opts.modFromBytes;
    allowedLengths = _opts.allowedLengths;
  } else {
    if (typeof bitLenOrOpts === "number")
      _nbitLength = bitLenOrOpts;
    if (opts.sqrt)
      _sqrt = opts.sqrt;
  }
  const { nBitLength: BITS, nByteLength: BYTES } = nLength(ORDER, _nbitLength);
  if (BYTES > 2048)
    throw new Error("invalid field: expected ORDER of <= 2048 bytes");
  let sqrtP;
  const f = Object.freeze({
    ORDER,
    isLE: isLE2,
    BITS,
    BYTES,
    MASK: bitMask(BITS),
    ZERO: _0n2,
    ONE: _1n2,
    allowedLengths,
    create: (num) => mod(num, ORDER),
    isValid: (num) => {
      if (typeof num !== "bigint")
        throw new Error("invalid field element: expected bigint, got " + typeof num);
      return _0n2 <= num && num < ORDER;
    },
    is0: (num) => num === _0n2,
    // is valid and invertible
    isValidNot0: (num) => !f.is0(num) && f.isValid(num),
    isOdd: (num) => (num & _1n2) === _1n2,
    neg: (num) => mod(-num, ORDER),
    eql: (lhs, rhs) => lhs === rhs,
    sqr: (num) => mod(num * num, ORDER),
    add: (lhs, rhs) => mod(lhs + rhs, ORDER),
    sub: (lhs, rhs) => mod(lhs - rhs, ORDER),
    mul: (lhs, rhs) => mod(lhs * rhs, ORDER),
    pow: (num, power) => FpPow(f, num, power),
    div: (lhs, rhs) => mod(lhs * invert(rhs, ORDER), ORDER),
    // Same as above, but doesn't normalize
    sqrN: (num) => num * num,
    addN: (lhs, rhs) => lhs + rhs,
    subN: (lhs, rhs) => lhs - rhs,
    mulN: (lhs, rhs) => lhs * rhs,
    inv: (num) => invert(num, ORDER),
    sqrt: _sqrt || ((n) => {
      if (!sqrtP)
        sqrtP = FpSqrt(ORDER);
      return sqrtP(f, n);
    }),
    toBytes: (num) => isLE2 ? numberToBytesLE(num, BYTES) : numberToBytesBE(num, BYTES),
    fromBytes: (bytes, skipValidation = true) => {
      if (allowedLengths) {
        if (!allowedLengths.includes(bytes.length) || bytes.length > BYTES) {
          throw new Error("Field.fromBytes: expected " + allowedLengths + " bytes, got " + bytes.length);
        }
        const padded = new Uint8Array(BYTES);
        padded.set(bytes, isLE2 ? 0 : padded.length - bytes.length);
        bytes = padded;
      }
      if (bytes.length !== BYTES)
        throw new Error("Field.fromBytes: expected " + BYTES + " bytes, got " + bytes.length);
      let scalar = isLE2 ? bytesToNumberLE(bytes) : bytesToNumberBE(bytes);
      if (modFromBytes)
        scalar = mod(scalar, ORDER);
      if (!skipValidation) {
        if (!f.isValid(scalar))
          throw new Error("invalid field element: outside of range 0..ORDER");
      }
      return scalar;
    },
    // TODO: we don't need it here, move out to separate fn
    invertBatch: (lst) => FpInvertBatch(f, lst),
    // We can't move this out because Fp6, Fp12 implement it
    // and it's unclear what to return in there.
    cmov: (a, b, c) => c ? b : a
  });
  return Object.freeze(f);
}
function getFieldBytesLength(fieldOrder) {
  if (typeof fieldOrder !== "bigint")
    throw new Error("field order must be bigint");
  const bitLength = fieldOrder.toString(2).length;
  return Math.ceil(bitLength / 8);
}
function getMinHashLength(fieldOrder) {
  const length = getFieldBytesLength(fieldOrder);
  return length + Math.ceil(length / 2);
}
function mapHashToField(key, fieldOrder, isLE2 = false) {
  const len = key.length;
  const fieldLen = getFieldBytesLength(fieldOrder);
  const minLen = getMinHashLength(fieldOrder);
  if (len < 16 || len < minLen || len > 1024)
    throw new Error("expected " + minLen + "-1024 bytes of input, got " + len);
  const num = isLE2 ? bytesToNumberLE(key) : bytesToNumberBE(key);
  const reduced = mod(num, fieldOrder - _1n2) + _1n2;
  return isLE2 ? numberToBytesLE(reduced, fieldLen) : numberToBytesBE(reduced, fieldLen);
}

// node_modules/@noble/curves/esm/abstract/curve.js
var _0n3 = BigInt(0);
var _1n3 = BigInt(1);
function negateCt(condition, item) {
  const neg = item.negate();
  return condition ? neg : item;
}
function normalizeZ(c, points) {
  const invertedZs = FpInvertBatch(c.Fp, points.map((p) => p.Z));
  return points.map((p, i) => c.fromAffine(p.toAffine(invertedZs[i])));
}
function validateW(W, bits) {
  if (!Number.isSafeInteger(W) || W <= 0 || W > bits)
    throw new Error("invalid window size, expected [1.." + bits + "], got W=" + W);
}
function calcWOpts(W, scalarBits) {
  validateW(W, scalarBits);
  const windows = Math.ceil(scalarBits / W) + 1;
  const windowSize = 2 ** (W - 1);
  const maxNumber = 2 ** W;
  const mask = bitMask(W);
  const shiftBy = BigInt(W);
  return { windows, windowSize, mask, maxNumber, shiftBy };
}
function calcOffsets(n, window, wOpts) {
  const { windowSize, mask, maxNumber, shiftBy } = wOpts;
  let wbits = Number(n & mask);
  let nextN = n >> shiftBy;
  if (wbits > windowSize) {
    wbits -= maxNumber;
    nextN += _1n3;
  }
  const offsetStart = window * windowSize;
  const offset = offsetStart + Math.abs(wbits) - 1;
  const isZero = wbits === 0;
  const isNeg = wbits < 0;
  const isNegF = window % 2 !== 0;
  const offsetF = offsetStart;
  return { nextN, offset, isZero, isNeg, isNegF, offsetF };
}
function validateMSMPoints(points, c) {
  if (!Array.isArray(points))
    throw new Error("array expected");
  points.forEach((p, i) => {
    if (!(p instanceof c))
      throw new Error("invalid point at index " + i);
  });
}
function validateMSMScalars(scalars, field) {
  if (!Array.isArray(scalars))
    throw new Error("array of scalars expected");
  scalars.forEach((s, i) => {
    if (!field.isValid(s))
      throw new Error("invalid scalar at index " + i);
  });
}
var pointPrecomputes = /* @__PURE__ */ new WeakMap();
var pointWindowSizes = /* @__PURE__ */ new WeakMap();
function getW(P) {
  return pointWindowSizes.get(P) || 1;
}
function assert0(n) {
  if (n !== _0n3)
    throw new Error("invalid wNAF");
}
var wNAF = class {
  // Parametrized with a given Point class (not individual point)
  constructor(Point, bits) {
    this.BASE = Point.BASE;
    this.ZERO = Point.ZERO;
    this.Fn = Point.Fn;
    this.bits = bits;
  }
  // non-const time multiplication ladder
  _unsafeLadder(elm, n, p = this.ZERO) {
    let d = elm;
    while (n > _0n3) {
      if (n & _1n3)
        p = p.add(d);
      d = d.double();
      n >>= _1n3;
    }
    return p;
  }
  /**
   * Creates a wNAF precomputation window. Used for caching.
   * Default window size is set by `utils.precompute()` and is equal to 8.
   * Number of precomputed points depends on the curve size:
   * 2^(𝑊−1) * (Math.ceil(𝑛 / 𝑊) + 1), where:
   * - 𝑊 is the window size
   * - 𝑛 is the bitlength of the curve order.
   * For a 256-bit curve and window size 8, the number of precomputed points is 128 * 33 = 4224.
   * @param point Point instance
   * @param W window size
   * @returns precomputed point tables flattened to a single array
   */
  precomputeWindow(point, W) {
    const { windows, windowSize } = calcWOpts(W, this.bits);
    const points = [];
    let p = point;
    let base = p;
    for (let window = 0; window < windows; window++) {
      base = p;
      points.push(base);
      for (let i = 1; i < windowSize; i++) {
        base = base.add(p);
        points.push(base);
      }
      p = base.double();
    }
    return points;
  }
  /**
   * Implements ec multiplication using precomputed tables and w-ary non-adjacent form.
   * More compact implementation:
   * https://github.com/paulmillr/noble-secp256k1/blob/47cb1669b6e506ad66b35fe7d76132ae97465da2/index.ts#L502-L541
   * @returns real and fake (for const-time) points
   */
  wNAF(W, precomputes, n) {
    if (!this.Fn.isValid(n))
      throw new Error("invalid scalar");
    let p = this.ZERO;
    let f = this.BASE;
    const wo = calcWOpts(W, this.bits);
    for (let window = 0; window < wo.windows; window++) {
      const { nextN, offset, isZero, isNeg, isNegF, offsetF } = calcOffsets(n, window, wo);
      n = nextN;
      if (isZero) {
        f = f.add(negateCt(isNegF, precomputes[offsetF]));
      } else {
        p = p.add(negateCt(isNeg, precomputes[offset]));
      }
    }
    assert0(n);
    return { p, f };
  }
  /**
   * Implements ec unsafe (non const-time) multiplication using precomputed tables and w-ary non-adjacent form.
   * @param acc accumulator point to add result of multiplication
   * @returns point
   */
  wNAFUnsafe(W, precomputes, n, acc = this.ZERO) {
    const wo = calcWOpts(W, this.bits);
    for (let window = 0; window < wo.windows; window++) {
      if (n === _0n3)
        break;
      const { nextN, offset, isZero, isNeg } = calcOffsets(n, window, wo);
      n = nextN;
      if (isZero) {
        continue;
      } else {
        const item = precomputes[offset];
        acc = acc.add(isNeg ? item.negate() : item);
      }
    }
    assert0(n);
    return acc;
  }
  getPrecomputes(W, point, transform) {
    let comp = pointPrecomputes.get(point);
    if (!comp) {
      comp = this.precomputeWindow(point, W);
      if (W !== 1) {
        if (typeof transform === "function")
          comp = transform(comp);
        pointPrecomputes.set(point, comp);
      }
    }
    return comp;
  }
  cached(point, scalar, transform) {
    const W = getW(point);
    return this.wNAF(W, this.getPrecomputes(W, point, transform), scalar);
  }
  unsafe(point, scalar, transform, prev) {
    const W = getW(point);
    if (W === 1)
      return this._unsafeLadder(point, scalar, prev);
    return this.wNAFUnsafe(W, this.getPrecomputes(W, point, transform), scalar, prev);
  }
  // We calculate precomputes for elliptic curve point multiplication
  // using windowed method. This specifies window size and
  // stores precomputed values. Usually only base point would be precomputed.
  createCache(P, W) {
    validateW(W, this.bits);
    pointWindowSizes.set(P, W);
    pointPrecomputes.delete(P);
  }
  hasCache(elm) {
    return getW(elm) !== 1;
  }
};
function mulEndoUnsafe(Point, point, k1, k2) {
  let acc = point;
  let p1 = Point.ZERO;
  let p2 = Point.ZERO;
  while (k1 > _0n3 || k2 > _0n3) {
    if (k1 & _1n3)
      p1 = p1.add(acc);
    if (k2 & _1n3)
      p2 = p2.add(acc);
    acc = acc.double();
    k1 >>= _1n3;
    k2 >>= _1n3;
  }
  return { p1, p2 };
}
function pippenger(c, fieldN, points, scalars) {
  validateMSMPoints(points, c);
  validateMSMScalars(scalars, fieldN);
  const plength = points.length;
  const slength = scalars.length;
  if (plength !== slength)
    throw new Error("arrays of points and scalars must have equal length");
  const zero = c.ZERO;
  const wbits = bitLen(BigInt(plength));
  let windowSize = 1;
  if (wbits > 12)
    windowSize = wbits - 3;
  else if (wbits > 4)
    windowSize = wbits - 2;
  else if (wbits > 0)
    windowSize = 2;
  const MASK = bitMask(windowSize);
  const buckets = new Array(Number(MASK) + 1).fill(zero);
  const lastBits = Math.floor((fieldN.BITS - 1) / windowSize) * windowSize;
  let sum = zero;
  for (let i = lastBits; i >= 0; i -= windowSize) {
    buckets.fill(zero);
    for (let j = 0; j < slength; j++) {
      const scalar = scalars[j];
      const wbits2 = Number(scalar >> BigInt(i) & MASK);
      buckets[wbits2] = buckets[wbits2].add(points[j]);
    }
    let resI = zero;
    for (let j = buckets.length - 1, sumI = zero; j > 0; j--) {
      sumI = sumI.add(buckets[j]);
      resI = resI.add(sumI);
    }
    sum = sum.add(resI);
    if (i !== 0)
      for (let j = 0; j < windowSize; j++)
        sum = sum.double();
  }
  return sum;
}
function createField(order, field, isLE2) {
  if (field) {
    if (field.ORDER !== order)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    validateField(field);
    return field;
  } else {
    return Field(order, { isLE: isLE2 });
  }
}
function _createCurveFields(type, CURVE, curveOpts = {}, FpFnLE) {
  if (FpFnLE === void 0)
    FpFnLE = type === "edwards";
  if (!CURVE || typeof CURVE !== "object")
    throw new Error(`expected valid ${type} CURVE object`);
  for (const p of ["p", "n", "h"]) {
    const val = CURVE[p];
    if (!(typeof val === "bigint" && val > _0n3))
      throw new Error(`CURVE.${p} must be positive bigint`);
  }
  const Fp = createField(CURVE.p, curveOpts.Fp, FpFnLE);
  const Fn = createField(CURVE.n, curveOpts.Fn, FpFnLE);
  const _b = type === "weierstrass" ? "b" : "d";
  const params = ["Gx", "Gy", "a", _b];
  for (const p of params) {
    if (!Fp.isValid(CURVE[p]))
      throw new Error(`CURVE.${p} must be valid field element of CURVE.Fp`);
  }
  CURVE = Object.freeze(Object.assign({}, CURVE));
  return { CURVE, Fp, Fn };
}

// node_modules/@noble/curves/esm/abstract/weierstrass.js
var divNearest = (num, den) => (num + (num >= 0 ? den : -den) / _2n2) / den;
function _splitEndoScalar(k, basis, n) {
  const [[a1, b1], [a2, b2]] = basis;
  const c1 = divNearest(b2 * k, n);
  const c2 = divNearest(-b1 * k, n);
  let k1 = k - c1 * a1 - c2 * a2;
  let k2 = -c1 * b1 - c2 * b2;
  const k1neg = k1 < _0n4;
  const k2neg = k2 < _0n4;
  if (k1neg)
    k1 = -k1;
  if (k2neg)
    k2 = -k2;
  const MAX_NUM = bitMask(Math.ceil(bitLen(n) / 2)) + _1n4;
  if (k1 < _0n4 || k1 >= MAX_NUM || k2 < _0n4 || k2 >= MAX_NUM) {
    throw new Error("splitScalar (endomorphism): failed, k=" + k);
  }
  return { k1neg, k1, k2neg, k2 };
}
function validateSigFormat(format) {
  if (!["compact", "recovered", "der"].includes(format))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return format;
}
function validateSigOpts(opts, def) {
  const optsn = {};
  for (let optName of Object.keys(def)) {
    optsn[optName] = opts[optName] === void 0 ? def[optName] : opts[optName];
  }
  _abool2(optsn.lowS, "lowS");
  _abool2(optsn.prehash, "prehash");
  if (optsn.format !== void 0)
    validateSigFormat(optsn.format);
  return optsn;
}
var DERErr = class extends Error {
  constructor(m = "") {
    super(m);
  }
};
var DER = {
  // asn.1 DER encoding utils
  Err: DERErr,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (tag, data) => {
      const { Err: E } = DER;
      if (tag < 0 || tag > 256)
        throw new E("tlv.encode: wrong tag");
      if (data.length & 1)
        throw new E("tlv.encode: unpadded data");
      const dataLen = data.length / 2;
      const len = numberToHexUnpadded(dataLen);
      if (len.length / 2 & 128)
        throw new E("tlv.encode: long form length too big");
      const lenLen = dataLen > 127 ? numberToHexUnpadded(len.length / 2 | 128) : "";
      const t = numberToHexUnpadded(tag);
      return t + lenLen + len + data;
    },
    // v - value, l - left bytes (unparsed)
    decode(tag, data) {
      const { Err: E } = DER;
      let pos = 0;
      if (tag < 0 || tag > 256)
        throw new E("tlv.encode: wrong tag");
      if (data.length < 2 || data[pos++] !== tag)
        throw new E("tlv.decode: wrong tlv");
      const first = data[pos++];
      const isLong = !!(first & 128);
      let length = 0;
      if (!isLong)
        length = first;
      else {
        const lenLen = first & 127;
        if (!lenLen)
          throw new E("tlv.decode(long): indefinite length not supported");
        if (lenLen > 4)
          throw new E("tlv.decode(long): byte length is too big");
        const lengthBytes = data.subarray(pos, pos + lenLen);
        if (lengthBytes.length !== lenLen)
          throw new E("tlv.decode: length bytes not complete");
        if (lengthBytes[0] === 0)
          throw new E("tlv.decode(long): zero leftmost byte");
        for (const b of lengthBytes)
          length = length << 8 | b;
        pos += lenLen;
        if (length < 128)
          throw new E("tlv.decode(long): not minimal encoding");
      }
      const v = data.subarray(pos, pos + length);
      if (v.length !== length)
        throw new E("tlv.decode: wrong value length");
      return { v, l: data.subarray(pos + length) };
    }
  },
  // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
  // since we always use positive integers here. It must always be empty:
  // - add zero byte if exists
  // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
  _int: {
    encode(num) {
      const { Err: E } = DER;
      if (num < _0n4)
        throw new E("integer: negative integers are not allowed");
      let hex = numberToHexUnpadded(num);
      if (Number.parseInt(hex[0], 16) & 8)
        hex = "00" + hex;
      if (hex.length & 1)
        throw new E("unexpected DER parsing assertion: unpadded hex");
      return hex;
    },
    decode(data) {
      const { Err: E } = DER;
      if (data[0] & 128)
        throw new E("invalid signature integer: negative");
      if (data[0] === 0 && !(data[1] & 128))
        throw new E("invalid signature integer: unnecessary leading zero");
      return bytesToNumberBE(data);
    }
  },
  toSig(hex) {
    const { Err: E, _int: int2, _tlv: tlv } = DER;
    const data = ensureBytes("signature", hex);
    const { v: seqBytes, l: seqLeftBytes } = tlv.decode(48, data);
    if (seqLeftBytes.length)
      throw new E("invalid signature: left bytes after parsing");
    const { v: rBytes, l: rLeftBytes } = tlv.decode(2, seqBytes);
    const { v: sBytes, l: sLeftBytes } = tlv.decode(2, rLeftBytes);
    if (sLeftBytes.length)
      throw new E("invalid signature: left bytes after parsing");
    return { r: int2.decode(rBytes), s: int2.decode(sBytes) };
  },
  hexFromSig(sig) {
    const { _tlv: tlv, _int: int2 } = DER;
    const rs = tlv.encode(2, int2.encode(sig.r));
    const ss = tlv.encode(2, int2.encode(sig.s));
    const seq = rs + ss;
    return tlv.encode(48, seq);
  }
};
var _0n4 = BigInt(0);
var _1n4 = BigInt(1);
var _2n2 = BigInt(2);
var _3n2 = BigInt(3);
var _4n2 = BigInt(4);
function _normFnElement(Fn, key) {
  const { BYTES: expected } = Fn;
  let num;
  if (typeof key === "bigint") {
    num = key;
  } else {
    let bytes = ensureBytes("private key", key);
    try {
      num = Fn.fromBytes(bytes);
    } catch (error) {
      throw new Error(`invalid private key: expected ui8a of size ${expected}, got ${typeof key}`);
    }
  }
  if (!Fn.isValidNot0(num))
    throw new Error("invalid private key: out of range [1..N-1]");
  return num;
}
function weierstrassN(params, extraOpts = {}) {
  const validated = _createCurveFields("weierstrass", params, extraOpts);
  const { Fp, Fn } = validated;
  let CURVE = validated.CURVE;
  const { h: cofactor, n: CURVE_ORDER } = CURVE;
  _validateObject(extraOpts, {}, {
    allowInfinityPoint: "boolean",
    clearCofactor: "function",
    isTorsionFree: "function",
    fromBytes: "function",
    toBytes: "function",
    endo: "object",
    wrapPrivateKey: "boolean"
  });
  const { endo } = extraOpts;
  if (endo) {
    if (!Fp.is0(CURVE.a) || typeof endo.beta !== "bigint" || !Array.isArray(endo.basises)) {
      throw new Error('invalid endo: expected "beta": bigint and "basises": array');
    }
  }
  const lengths = getWLengths(Fp, Fn);
  function assertCompressionIsSupported() {
    if (!Fp.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function pointToBytes(_c, point, isCompressed) {
    const { x, y } = point.toAffine();
    const bx = Fp.toBytes(x);
    _abool2(isCompressed, "isCompressed");
    if (isCompressed) {
      assertCompressionIsSupported();
      const hasEvenY = !Fp.isOdd(y);
      return concatBytes(pprefix(hasEvenY), bx);
    } else {
      return concatBytes(Uint8Array.of(4), bx, Fp.toBytes(y));
    }
  }
  function pointFromBytes(bytes) {
    _abytes2(bytes, void 0, "Point");
    const { publicKey: comp, publicKeyUncompressed: uncomp } = lengths;
    const length = bytes.length;
    const head = bytes[0];
    const tail = bytes.subarray(1);
    if (length === comp && (head === 2 || head === 3)) {
      const x = Fp.fromBytes(tail);
      if (!Fp.isValid(x))
        throw new Error("bad point: is not on curve, wrong x");
      const y2 = weierstrassEquation(x);
      let y;
      try {
        y = Fp.sqrt(y2);
      } catch (sqrtError) {
        const err = sqrtError instanceof Error ? ": " + sqrtError.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + err);
      }
      assertCompressionIsSupported();
      const isYOdd = Fp.isOdd(y);
      const isHeadOdd = (head & 1) === 1;
      if (isHeadOdd !== isYOdd)
        y = Fp.neg(y);
      return { x, y };
    } else if (length === uncomp && head === 4) {
      const L = Fp.BYTES;
      const x = Fp.fromBytes(tail.subarray(0, L));
      const y = Fp.fromBytes(tail.subarray(L, L * 2));
      if (!isValidXY(x, y))
        throw new Error("bad point: is not on curve");
      return { x, y };
    } else {
      throw new Error(`bad point: got length ${length}, expected compressed=${comp} or uncompressed=${uncomp}`);
    }
  }
  const encodePoint = extraOpts.toBytes || pointToBytes;
  const decodePoint = extraOpts.fromBytes || pointFromBytes;
  function weierstrassEquation(x) {
    const x2 = Fp.sqr(x);
    const x3 = Fp.mul(x2, x);
    return Fp.add(Fp.add(x3, Fp.mul(x, CURVE.a)), CURVE.b);
  }
  function isValidXY(x, y) {
    const left = Fp.sqr(y);
    const right = weierstrassEquation(x);
    return Fp.eql(left, right);
  }
  if (!isValidXY(CURVE.Gx, CURVE.Gy))
    throw new Error("bad curve params: generator point");
  const _4a3 = Fp.mul(Fp.pow(CURVE.a, _3n2), _4n2);
  const _27b2 = Fp.mul(Fp.sqr(CURVE.b), BigInt(27));
  if (Fp.is0(Fp.add(_4a3, _27b2)))
    throw new Error("bad curve params: a or b");
  function acoord(title, n, banZero = false) {
    if (!Fp.isValid(n) || banZero && Fp.is0(n))
      throw new Error(`bad point coordinate ${title}`);
    return n;
  }
  function aprjpoint(other) {
    if (!(other instanceof Point))
      throw new Error("ProjectivePoint expected");
  }
  function splitEndoScalarN(k) {
    if (!endo || !endo.basises)
      throw new Error("no endo");
    return _splitEndoScalar(k, endo.basises, Fn.ORDER);
  }
  const toAffineMemo = memoized((p, iz) => {
    const { X, Y, Z } = p;
    if (Fp.eql(Z, Fp.ONE))
      return { x: X, y: Y };
    const is0 = p.is0();
    if (iz == null)
      iz = is0 ? Fp.ONE : Fp.inv(Z);
    const x = Fp.mul(X, iz);
    const y = Fp.mul(Y, iz);
    const zz = Fp.mul(Z, iz);
    if (is0)
      return { x: Fp.ZERO, y: Fp.ZERO };
    if (!Fp.eql(zz, Fp.ONE))
      throw new Error("invZ was invalid");
    return { x, y };
  });
  const assertValidMemo = memoized((p) => {
    if (p.is0()) {
      if (extraOpts.allowInfinityPoint && !Fp.is0(p.Y))
        return;
      throw new Error("bad point: ZERO");
    }
    const { x, y } = p.toAffine();
    if (!Fp.isValid(x) || !Fp.isValid(y))
      throw new Error("bad point: x or y not field elements");
    if (!isValidXY(x, y))
      throw new Error("bad point: equation left != right");
    if (!p.isTorsionFree())
      throw new Error("bad point: not in prime-order subgroup");
    return true;
  });
  function finishEndo(endoBeta, k1p, k2p, k1neg, k2neg) {
    k2p = new Point(Fp.mul(k2p.X, endoBeta), k2p.Y, k2p.Z);
    k1p = negateCt(k1neg, k1p);
    k2p = negateCt(k2neg, k2p);
    return k1p.add(k2p);
  }
  class Point {
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    constructor(X, Y, Z) {
      this.X = acoord("x", X);
      this.Y = acoord("y", Y, true);
      this.Z = acoord("z", Z);
      Object.freeze(this);
    }
    static CURVE() {
      return CURVE;
    }
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    static fromAffine(p) {
      const { x, y } = p || {};
      if (!p || !Fp.isValid(x) || !Fp.isValid(y))
        throw new Error("invalid affine point");
      if (p instanceof Point)
        throw new Error("projective point not allowed");
      if (Fp.is0(x) && Fp.is0(y))
        return Point.ZERO;
      return new Point(x, y, Fp.ONE);
    }
    static fromBytes(bytes) {
      const P = Point.fromAffine(decodePoint(_abytes2(bytes, void 0, "point")));
      P.assertValidity();
      return P;
    }
    static fromHex(hex) {
      return Point.fromBytes(ensureBytes("pointHex", hex));
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    /**
     *
     * @param windowSize
     * @param isLazy true will defer table computation until the first multiplication
     * @returns
     */
    precompute(windowSize = 8, isLazy = true) {
      wnaf.createCache(this, windowSize);
      if (!isLazy)
        this.multiply(_3n2);
      return this;
    }
    // TODO: return `this`
    /** A point on curve is valid if it conforms to equation. */
    assertValidity() {
      assertValidMemo(this);
    }
    hasEvenY() {
      const { y } = this.toAffine();
      if (!Fp.isOdd)
        throw new Error("Field doesn't support isOdd");
      return !Fp.isOdd(y);
    }
    /** Compare one point to another. */
    equals(other) {
      aprjpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      const U1 = Fp.eql(Fp.mul(X1, Z2), Fp.mul(X2, Z1));
      const U2 = Fp.eql(Fp.mul(Y1, Z2), Fp.mul(Y2, Z1));
      return U1 && U2;
    }
    /** Flips point to one corresponding to (x, -y) in Affine coordinates. */
    negate() {
      return new Point(this.X, Fp.neg(this.Y), this.Z);
    }
    // Renes-Costello-Batina exception-free doubling formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 3
    // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
    double() {
      const { a, b } = CURVE;
      const b3 = Fp.mul(b, _3n2);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO;
      let t0 = Fp.mul(X1, X1);
      let t1 = Fp.mul(Y1, Y1);
      let t2 = Fp.mul(Z1, Z1);
      let t3 = Fp.mul(X1, Y1);
      t3 = Fp.add(t3, t3);
      Z3 = Fp.mul(X1, Z1);
      Z3 = Fp.add(Z3, Z3);
      X3 = Fp.mul(a, Z3);
      Y3 = Fp.mul(b3, t2);
      Y3 = Fp.add(X3, Y3);
      X3 = Fp.sub(t1, Y3);
      Y3 = Fp.add(t1, Y3);
      Y3 = Fp.mul(X3, Y3);
      X3 = Fp.mul(t3, X3);
      Z3 = Fp.mul(b3, Z3);
      t2 = Fp.mul(a, t2);
      t3 = Fp.sub(t0, t2);
      t3 = Fp.mul(a, t3);
      t3 = Fp.add(t3, Z3);
      Z3 = Fp.add(t0, t0);
      t0 = Fp.add(Z3, t0);
      t0 = Fp.add(t0, t2);
      t0 = Fp.mul(t0, t3);
      Y3 = Fp.add(Y3, t0);
      t2 = Fp.mul(Y1, Z1);
      t2 = Fp.add(t2, t2);
      t0 = Fp.mul(t2, t3);
      X3 = Fp.sub(X3, t0);
      Z3 = Fp.mul(t2, t1);
      Z3 = Fp.add(Z3, Z3);
      Z3 = Fp.add(Z3, Z3);
      return new Point(X3, Y3, Z3);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(other) {
      aprjpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO;
      const a = CURVE.a;
      const b3 = Fp.mul(CURVE.b, _3n2);
      let t0 = Fp.mul(X1, X2);
      let t1 = Fp.mul(Y1, Y2);
      let t2 = Fp.mul(Z1, Z2);
      let t3 = Fp.add(X1, Y1);
      let t4 = Fp.add(X2, Y2);
      t3 = Fp.mul(t3, t4);
      t4 = Fp.add(t0, t1);
      t3 = Fp.sub(t3, t4);
      t4 = Fp.add(X1, Z1);
      let t5 = Fp.add(X2, Z2);
      t4 = Fp.mul(t4, t5);
      t5 = Fp.add(t0, t2);
      t4 = Fp.sub(t4, t5);
      t5 = Fp.add(Y1, Z1);
      X3 = Fp.add(Y2, Z2);
      t5 = Fp.mul(t5, X3);
      X3 = Fp.add(t1, t2);
      t5 = Fp.sub(t5, X3);
      Z3 = Fp.mul(a, t4);
      X3 = Fp.mul(b3, t2);
      Z3 = Fp.add(X3, Z3);
      X3 = Fp.sub(t1, Z3);
      Z3 = Fp.add(t1, Z3);
      Y3 = Fp.mul(X3, Z3);
      t1 = Fp.add(t0, t0);
      t1 = Fp.add(t1, t0);
      t2 = Fp.mul(a, t2);
      t4 = Fp.mul(b3, t4);
      t1 = Fp.add(t1, t2);
      t2 = Fp.sub(t0, t2);
      t2 = Fp.mul(a, t2);
      t4 = Fp.add(t4, t2);
      t0 = Fp.mul(t1, t4);
      Y3 = Fp.add(Y3, t0);
      t0 = Fp.mul(t5, t4);
      X3 = Fp.mul(t3, X3);
      X3 = Fp.sub(X3, t0);
      t0 = Fp.mul(t3, t1);
      Z3 = Fp.mul(t5, Z3);
      Z3 = Fp.add(Z3, t0);
      return new Point(X3, Y3, Z3);
    }
    subtract(other) {
      return this.add(other.negate());
    }
    is0() {
      return this.equals(Point.ZERO);
    }
    /**
     * Constant time multiplication.
     * Uses wNAF method. Windowed method may be 10% faster,
     * but takes 2x longer to generate and consumes 2x memory.
     * Uses precomputes when available.
     * Uses endomorphism for Koblitz curves.
     * @param scalar by which the point would be multiplied
     * @returns New point
     */
    multiply(scalar) {
      const { endo: endo2 } = extraOpts;
      if (!Fn.isValidNot0(scalar))
        throw new Error("invalid scalar: out of range");
      let point, fake;
      const mul = (n) => wnaf.cached(this, n, (p) => normalizeZ(Point, p));
      if (endo2) {
        const { k1neg, k1, k2neg, k2 } = splitEndoScalarN(scalar);
        const { p: k1p, f: k1f } = mul(k1);
        const { p: k2p, f: k2f } = mul(k2);
        fake = k1f.add(k2f);
        point = finishEndo(endo2.beta, k1p, k2p, k1neg, k2neg);
      } else {
        const { p, f } = mul(scalar);
        point = p;
        fake = f;
      }
      return normalizeZ(Point, [point, fake])[0];
    }
    /**
     * Non-constant-time multiplication. Uses double-and-add algorithm.
     * It's faster, but should only be used when you don't care about
     * an exposed secret key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(sc) {
      const { endo: endo2 } = extraOpts;
      const p = this;
      if (!Fn.isValid(sc))
        throw new Error("invalid scalar: out of range");
      if (sc === _0n4 || p.is0())
        return Point.ZERO;
      if (sc === _1n4)
        return p;
      if (wnaf.hasCache(this))
        return this.multiply(sc);
      if (endo2) {
        const { k1neg, k1, k2neg, k2 } = splitEndoScalarN(sc);
        const { p1, p2 } = mulEndoUnsafe(Point, p, k1, k2);
        return finishEndo(endo2.beta, p1, p2, k1neg, k2neg);
      } else {
        return wnaf.unsafe(p, sc);
      }
    }
    multiplyAndAddUnsafe(Q, a, b) {
      const sum = this.multiplyUnsafe(a).add(Q.multiplyUnsafe(b));
      return sum.is0() ? void 0 : sum;
    }
    /**
     * Converts Projective point to affine (x, y) coordinates.
     * @param invertedZ Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
     */
    toAffine(invertedZ) {
      return toAffineMemo(this, invertedZ);
    }
    /**
     * Checks whether Point is free of torsion elements (is in prime subgroup).
     * Always torsion-free for cofactor=1 curves.
     */
    isTorsionFree() {
      const { isTorsionFree } = extraOpts;
      if (cofactor === _1n4)
        return true;
      if (isTorsionFree)
        return isTorsionFree(Point, this);
      return wnaf.unsafe(this, CURVE_ORDER).is0();
    }
    clearCofactor() {
      const { clearCofactor } = extraOpts;
      if (cofactor === _1n4)
        return this;
      if (clearCofactor)
        return clearCofactor(Point, this);
      return this.multiplyUnsafe(cofactor);
    }
    isSmallOrder() {
      return this.multiplyUnsafe(cofactor).is0();
    }
    toBytes(isCompressed = true) {
      _abool2(isCompressed, "isCompressed");
      this.assertValidity();
      return encodePoint(Point, this, isCompressed);
    }
    toHex(isCompressed = true) {
      return bytesToHex(this.toBytes(isCompressed));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
    // TODO: remove
    get px() {
      return this.X;
    }
    get py() {
      return this.X;
    }
    get pz() {
      return this.Z;
    }
    toRawBytes(isCompressed = true) {
      return this.toBytes(isCompressed);
    }
    _setWindowSize(windowSize) {
      this.precompute(windowSize);
    }
    static normalizeZ(points) {
      return normalizeZ(Point, points);
    }
    static msm(points, scalars) {
      return pippenger(Point, Fn, points, scalars);
    }
    static fromPrivateKey(privateKey) {
      return Point.BASE.multiply(_normFnElement(Fn, privateKey));
    }
  }
  Point.BASE = new Point(CURVE.Gx, CURVE.Gy, Fp.ONE);
  Point.ZERO = new Point(Fp.ZERO, Fp.ONE, Fp.ZERO);
  Point.Fp = Fp;
  Point.Fn = Fn;
  const bits = Fn.BITS;
  const wnaf = new wNAF(Point, extraOpts.endo ? Math.ceil(bits / 2) : bits);
  Point.BASE.precompute(8);
  return Point;
}
function pprefix(hasEvenY) {
  return Uint8Array.of(hasEvenY ? 2 : 3);
}
function getWLengths(Fp, Fn) {
  return {
    secretKey: Fn.BYTES,
    publicKey: 1 + Fp.BYTES,
    publicKeyUncompressed: 1 + 2 * Fp.BYTES,
    publicKeyHasPrefix: true,
    signature: 2 * Fn.BYTES
  };
}
function ecdh(Point, ecdhOpts = {}) {
  const { Fn } = Point;
  const randomBytes_ = ecdhOpts.randomBytes || randomBytes;
  const lengths = Object.assign(getWLengths(Point.Fp, Fn), { seed: getMinHashLength(Fn.ORDER) });
  function isValidSecretKey(secretKey) {
    try {
      return !!_normFnElement(Fn, secretKey);
    } catch (error) {
      return false;
    }
  }
  function isValidPublicKey(publicKey, isCompressed) {
    const { publicKey: comp, publicKeyUncompressed } = lengths;
    try {
      const l = publicKey.length;
      if (isCompressed === true && l !== comp)
        return false;
      if (isCompressed === false && l !== publicKeyUncompressed)
        return false;
      return !!Point.fromBytes(publicKey);
    } catch (error) {
      return false;
    }
  }
  function randomSecretKey(seed = randomBytes_(lengths.seed)) {
    return mapHashToField(_abytes2(seed, lengths.seed, "seed"), Fn.ORDER);
  }
  function getPublicKey(secretKey, isCompressed = true) {
    return Point.BASE.multiply(_normFnElement(Fn, secretKey)).toBytes(isCompressed);
  }
  function keygen(seed) {
    const secretKey = randomSecretKey(seed);
    return { secretKey, publicKey: getPublicKey(secretKey) };
  }
  function isProbPub(item) {
    if (typeof item === "bigint")
      return false;
    if (item instanceof Point)
      return true;
    const { secretKey, publicKey, publicKeyUncompressed } = lengths;
    if (Fn.allowedLengths || secretKey === publicKey)
      return void 0;
    const l = ensureBytes("key", item).length;
    return l === publicKey || l === publicKeyUncompressed;
  }
  function getSharedSecret(secretKeyA, publicKeyB, isCompressed = true) {
    if (isProbPub(secretKeyA) === true)
      throw new Error("first arg must be private key");
    if (isProbPub(publicKeyB) === false)
      throw new Error("second arg must be public key");
    const s = _normFnElement(Fn, secretKeyA);
    const b = Point.fromHex(publicKeyB);
    return b.multiply(s).toBytes(isCompressed);
  }
  const utils = {
    isValidSecretKey,
    isValidPublicKey,
    randomSecretKey,
    // TODO: remove
    isValidPrivateKey: isValidSecretKey,
    randomPrivateKey: randomSecretKey,
    normPrivateKeyToScalar: (key) => _normFnElement(Fn, key),
    precompute(windowSize = 8, point = Point.BASE) {
      return point.precompute(windowSize, false);
    }
  };
  return Object.freeze({ getPublicKey, getSharedSecret, keygen, Point, utils, lengths });
}
function ecdsa(Point, hash, ecdsaOpts = {}) {
  ahash(hash);
  _validateObject(ecdsaOpts, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  });
  const randomBytes2 = ecdsaOpts.randomBytes || randomBytes;
  const hmac2 = ecdsaOpts.hmac || ((key, ...msgs) => hmac(hash, key, concatBytes(...msgs)));
  const { Fp, Fn } = Point;
  const { ORDER: CURVE_ORDER, BITS: fnBits } = Fn;
  const { keygen, getPublicKey, getSharedSecret, utils, lengths } = ecdh(Point, ecdsaOpts);
  const defaultSigOpts = {
    prehash: false,
    lowS: typeof ecdsaOpts.lowS === "boolean" ? ecdsaOpts.lowS : false,
    format: void 0,
    //'compact' as ECDSASigFormat,
    extraEntropy: false
  };
  const defaultSigOpts_format = "compact";
  function isBiggerThanHalfOrder(number) {
    const HALF = CURVE_ORDER >> _1n4;
    return number > HALF;
  }
  function validateRS(title, num) {
    if (!Fn.isValidNot0(num))
      throw new Error(`invalid signature ${title}: out of range 1..Point.Fn.ORDER`);
    return num;
  }
  function validateSigLength(bytes, format) {
    validateSigFormat(format);
    const size = lengths.signature;
    const sizer = format === "compact" ? size : format === "recovered" ? size + 1 : void 0;
    return _abytes2(bytes, sizer, `${format} signature`);
  }
  class Signature {
    constructor(r, s, recovery) {
      this.r = validateRS("r", r);
      this.s = validateRS("s", s);
      if (recovery != null)
        this.recovery = recovery;
      Object.freeze(this);
    }
    static fromBytes(bytes, format = defaultSigOpts_format) {
      validateSigLength(bytes, format);
      let recid;
      if (format === "der") {
        const { r: r2, s: s2 } = DER.toSig(_abytes2(bytes));
        return new Signature(r2, s2);
      }
      if (format === "recovered") {
        recid = bytes[0];
        format = "compact";
        bytes = bytes.subarray(1);
      }
      const L = Fn.BYTES;
      const r = bytes.subarray(0, L);
      const s = bytes.subarray(L, L * 2);
      return new Signature(Fn.fromBytes(r), Fn.fromBytes(s), recid);
    }
    static fromHex(hex, format) {
      return this.fromBytes(hexToBytes(hex), format);
    }
    addRecoveryBit(recovery) {
      return new Signature(this.r, this.s, recovery);
    }
    recoverPublicKey(messageHash) {
      const FIELD_ORDER = Fp.ORDER;
      const { r, s, recovery: rec } = this;
      if (rec == null || ![0, 1, 2, 3].includes(rec))
        throw new Error("recovery id invalid");
      const hasCofactor = CURVE_ORDER * _2n2 < FIELD_ORDER;
      if (hasCofactor && rec > 1)
        throw new Error("recovery id is ambiguous for h>1 curve");
      const radj = rec === 2 || rec === 3 ? r + CURVE_ORDER : r;
      if (!Fp.isValid(radj))
        throw new Error("recovery id 2 or 3 invalid");
      const x = Fp.toBytes(radj);
      const R = Point.fromBytes(concatBytes(pprefix((rec & 1) === 0), x));
      const ir = Fn.inv(radj);
      const h = bits2int_modN(ensureBytes("msgHash", messageHash));
      const u1 = Fn.create(-h * ir);
      const u2 = Fn.create(s * ir);
      const Q = Point.BASE.multiplyUnsafe(u1).add(R.multiplyUnsafe(u2));
      if (Q.is0())
        throw new Error("point at infinify");
      Q.assertValidity();
      return Q;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return isBiggerThanHalfOrder(this.s);
    }
    toBytes(format = defaultSigOpts_format) {
      validateSigFormat(format);
      if (format === "der")
        return hexToBytes(DER.hexFromSig(this));
      const r = Fn.toBytes(this.r);
      const s = Fn.toBytes(this.s);
      if (format === "recovered") {
        if (this.recovery == null)
          throw new Error("recovery bit must be present");
        return concatBytes(Uint8Array.of(this.recovery), r, s);
      }
      return concatBytes(r, s);
    }
    toHex(format) {
      return bytesToHex(this.toBytes(format));
    }
    // TODO: remove
    assertValidity() {
    }
    static fromCompact(hex) {
      return Signature.fromBytes(ensureBytes("sig", hex), "compact");
    }
    static fromDER(hex) {
      return Signature.fromBytes(ensureBytes("sig", hex), "der");
    }
    normalizeS() {
      return this.hasHighS() ? new Signature(this.r, Fn.neg(this.s), this.recovery) : this;
    }
    toDERRawBytes() {
      return this.toBytes("der");
    }
    toDERHex() {
      return bytesToHex(this.toBytes("der"));
    }
    toCompactRawBytes() {
      return this.toBytes("compact");
    }
    toCompactHex() {
      return bytesToHex(this.toBytes("compact"));
    }
  }
  const bits2int = ecdsaOpts.bits2int || function bits2int_def(bytes) {
    if (bytes.length > 8192)
      throw new Error("input is too large");
    const num = bytesToNumberBE(bytes);
    const delta = bytes.length * 8 - fnBits;
    return delta > 0 ? num >> BigInt(delta) : num;
  };
  const bits2int_modN = ecdsaOpts.bits2int_modN || function bits2int_modN_def(bytes) {
    return Fn.create(bits2int(bytes));
  };
  const ORDER_MASK = bitMask(fnBits);
  function int2octets(num) {
    aInRange("num < 2^" + fnBits, num, _0n4, ORDER_MASK);
    return Fn.toBytes(num);
  }
  function validateMsgAndHash(message, prehash) {
    _abytes2(message, void 0, "message");
    return prehash ? _abytes2(hash(message), void 0, "prehashed message") : message;
  }
  function prepSig(message, privateKey, opts) {
    if (["recovered", "canonical"].some((k) => k in opts))
      throw new Error("sign() legacy options not supported");
    const { lowS, prehash, extraEntropy } = validateSigOpts(opts, defaultSigOpts);
    message = validateMsgAndHash(message, prehash);
    const h1int = bits2int_modN(message);
    const d = _normFnElement(Fn, privateKey);
    const seedArgs = [int2octets(d), int2octets(h1int)];
    if (extraEntropy != null && extraEntropy !== false) {
      const e = extraEntropy === true ? randomBytes2(lengths.secretKey) : extraEntropy;
      seedArgs.push(ensureBytes("extraEntropy", e));
    }
    const seed = concatBytes(...seedArgs);
    const m = h1int;
    function k2sig(kBytes) {
      const k = bits2int(kBytes);
      if (!Fn.isValidNot0(k))
        return;
      const ik = Fn.inv(k);
      const q = Point.BASE.multiply(k).toAffine();
      const r = Fn.create(q.x);
      if (r === _0n4)
        return;
      const s = Fn.create(ik * Fn.create(m + r * d));
      if (s === _0n4)
        return;
      let recovery = (q.x === r ? 0 : 2) | Number(q.y & _1n4);
      let normS = s;
      if (lowS && isBiggerThanHalfOrder(s)) {
        normS = Fn.neg(s);
        recovery ^= 1;
      }
      return new Signature(r, normS, recovery);
    }
    return { seed, k2sig };
  }
  function sign(message, secretKey, opts = {}) {
    message = ensureBytes("message", message);
    const { seed, k2sig } = prepSig(message, secretKey, opts);
    const drbg = createHmacDrbg(hash.outputLen, Fn.BYTES, hmac2);
    const sig = drbg(seed, k2sig);
    return sig;
  }
  function tryParsingSig(sg) {
    let sig = void 0;
    const isHex = typeof sg === "string" || isBytes(sg);
    const isObj = !isHex && sg !== null && typeof sg === "object" && typeof sg.r === "bigint" && typeof sg.s === "bigint";
    if (!isHex && !isObj)
      throw new Error("invalid signature, expected Uint8Array, hex string or Signature instance");
    if (isObj) {
      sig = new Signature(sg.r, sg.s);
    } else if (isHex) {
      try {
        sig = Signature.fromBytes(ensureBytes("sig", sg), "der");
      } catch (derError) {
        if (!(derError instanceof DER.Err))
          throw derError;
      }
      if (!sig) {
        try {
          sig = Signature.fromBytes(ensureBytes("sig", sg), "compact");
        } catch (error) {
          return false;
        }
      }
    }
    if (!sig)
      return false;
    return sig;
  }
  function verify(signature, message, publicKey, opts = {}) {
    const { lowS, prehash, format } = validateSigOpts(opts, defaultSigOpts);
    publicKey = ensureBytes("publicKey", publicKey);
    message = validateMsgAndHash(ensureBytes("message", message), prehash);
    if ("strict" in opts)
      throw new Error("options.strict was renamed to lowS");
    const sig = format === void 0 ? tryParsingSig(signature) : Signature.fromBytes(ensureBytes("sig", signature), format);
    if (sig === false)
      return false;
    try {
      const P = Point.fromBytes(publicKey);
      if (lowS && sig.hasHighS())
        return false;
      const { r, s } = sig;
      const h = bits2int_modN(message);
      const is = Fn.inv(s);
      const u1 = Fn.create(h * is);
      const u2 = Fn.create(r * is);
      const R = Point.BASE.multiplyUnsafe(u1).add(P.multiplyUnsafe(u2));
      if (R.is0())
        return false;
      const v = Fn.create(R.x);
      return v === r;
    } catch (e) {
      return false;
    }
  }
  function recoverPublicKey(signature, message, opts = {}) {
    const { prehash } = validateSigOpts(opts, defaultSigOpts);
    message = validateMsgAndHash(message, prehash);
    return Signature.fromBytes(signature, "recovered").recoverPublicKey(message).toBytes();
  }
  return Object.freeze({
    keygen,
    getPublicKey,
    getSharedSecret,
    utils,
    lengths,
    Point,
    sign,
    verify,
    recoverPublicKey,
    Signature,
    hash
  });
}
function _weierstrass_legacy_opts_to_new(c) {
  const CURVE = {
    a: c.a,
    b: c.b,
    p: c.Fp.ORDER,
    n: c.n,
    h: c.h,
    Gx: c.Gx,
    Gy: c.Gy
  };
  const Fp = c.Fp;
  let allowedLengths = c.allowedPrivateKeyLengths ? Array.from(new Set(c.allowedPrivateKeyLengths.map((l) => Math.ceil(l / 2)))) : void 0;
  const Fn = Field(CURVE.n, {
    BITS: c.nBitLength,
    allowedLengths,
    modFromBytes: c.wrapPrivateKey
  });
  const curveOpts = {
    Fp,
    Fn,
    allowInfinityPoint: c.allowInfinityPoint,
    endo: c.endo,
    isTorsionFree: c.isTorsionFree,
    clearCofactor: c.clearCofactor,
    fromBytes: c.fromBytes,
    toBytes: c.toBytes
  };
  return { CURVE, curveOpts };
}
function _ecdsa_legacy_opts_to_new(c) {
  const { CURVE, curveOpts } = _weierstrass_legacy_opts_to_new(c);
  const ecdsaOpts = {
    hmac: c.hmac,
    randomBytes: c.randomBytes,
    lowS: c.lowS,
    bits2int: c.bits2int,
    bits2int_modN: c.bits2int_modN
  };
  return { CURVE, curveOpts, hash: c.hash, ecdsaOpts };
}
function _ecdsa_new_output_to_legacy(c, _ecdsa) {
  const Point = _ecdsa.Point;
  return Object.assign({}, _ecdsa, {
    ProjectivePoint: Point,
    CURVE: Object.assign({}, c, nLength(Point.Fn.ORDER, Point.Fn.BITS))
  });
}
function weierstrass(c) {
  const { CURVE, curveOpts, hash, ecdsaOpts } = _ecdsa_legacy_opts_to_new(c);
  const Point = weierstrassN(CURVE, curveOpts);
  const signs = ecdsa(Point, hash, ecdsaOpts);
  return _ecdsa_new_output_to_legacy(c, signs);
}

// node_modules/@noble/curves/esm/_shortw_utils.js
function createCurve(curveDef, defHash) {
  const create = (hash) => weierstrass({ ...curveDef, hash });
  return { ...create(defHash), create };
}

// node_modules/@noble/curves/esm/secp256k1.js
var secp256k1_CURVE = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
};
var secp256k1_ENDO = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
};
var _2n3 = /* @__PURE__ */ BigInt(2);
function sqrtMod(y) {
  const P = secp256k1_CURVE.p;
  const _3n3 = BigInt(3), _6n = BigInt(6), _11n = BigInt(11), _22n = BigInt(22);
  const _23n = BigInt(23), _44n = BigInt(44), _88n = BigInt(88);
  const b2 = y * y * y % P;
  const b3 = b2 * b2 * y % P;
  const b6 = pow2(b3, _3n3, P) * b3 % P;
  const b9 = pow2(b6, _3n3, P) * b3 % P;
  const b11 = pow2(b9, _2n3, P) * b2 % P;
  const b22 = pow2(b11, _11n, P) * b11 % P;
  const b44 = pow2(b22, _22n, P) * b22 % P;
  const b88 = pow2(b44, _44n, P) * b44 % P;
  const b176 = pow2(b88, _88n, P) * b88 % P;
  const b220 = pow2(b176, _44n, P) * b44 % P;
  const b223 = pow2(b220, _3n3, P) * b3 % P;
  const t1 = pow2(b223, _23n, P) * b22 % P;
  const t2 = pow2(t1, _6n, P) * b2 % P;
  const root = pow2(t2, _2n3, P);
  if (!Fpk1.eql(Fpk1.sqr(root), y))
    throw new Error("Cannot find square root");
  return root;
}
var Fpk1 = Field(secp256k1_CURVE.p, { sqrt: sqrtMod });
var secp256k1 = createCurve({ ...secp256k1_CURVE, Fp: Fpk1, lowS: true, endo: secp256k1_ENDO }, sha256);

// src/lib/derive.ts
init_sha3();
function hexToBytes2(hex) {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToHex2(bytes) {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}
function concatBytes2(...arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}
function normalizePrivateKey(privateKey) {
  const hex = privateKey.startsWith("0x") ? privateKey.slice(2) : privateKey;
  if (hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("Invalid private key: expected 64 hex chars");
  }
  return hexToBytes2(hex);
}
function toChecksumAddress(addressLower) {
  const addr = addressLower.toLowerCase().replace(/^0x/, "");
  const hash = bytesToHex2(keccak_256(new TextEncoder().encode(addr)));
  let result = "0x";
  for (let i = 0; i < addr.length; i++) {
    result += parseInt(hash[i], 16) >= 8 ? addr[i].toUpperCase() : addr[i];
  }
  return result;
}
function addressFromPrivateKey(privateKey) {
  const priv = normalizePrivateKey(privateKey);
  const pub = secp256k1.getPublicKey(priv, false);
  const hash = keccak_256(pub.slice(1));
  return toChecksumAddress(`0x${bytesToHex2(hash.slice(-20))}`);
}
function encodeType(typeName, types) {
  const fields = types[typeName];
  if (!fields) return "";
  return `${typeName}(${fields.map((f) => `${f.type} ${f.name}`).join(",")})`;
}
function encodeIntField(value3) {
  const n = BigInt(typeof value3 === "string" ? value3 : Math.floor(Number(value3)));
  return hexToBytes2(n.toString(16).padStart(64, "0"));
}
function encodeField(fieldType, value3, types) {
  switch (fieldType) {
    case "string":
    case "bytes":
      return keccak_256(new TextEncoder().encode(String(value3)));
    case "address": {
      const addrBytes = hexToBytes2(String(value3).replace(/^0x/, ""));
      const padded = new Uint8Array(32);
      padded.set(addrBytes, 32 - addrBytes.length);
      return padded;
    }
    case "bool": {
      const padded = new Uint8Array(32);
      if (value3) padded[31] = 1;
      return padded;
    }
    case "uint256":
    case "int256":
      return encodeIntField(value3);
    default:
      if (types[fieldType]) return hashStruct(fieldType, value3, types);
      return encodeIntField(value3);
  }
}
function hashStruct(typeName, data, types) {
  const typeHash = keccak_256(new TextEncoder().encode(encodeType(typeName, types)));
  const parts = [typeHash];
  const fields = types[typeName];
  if (!fields) throw new Error(`EIP-712 type "${typeName}" not found`);
  for (const field of fields) {
    const val = data[field.name];
    parts.push(val === void 0 || val === null ? new Uint8Array(32) : encodeField(field.type, val, types));
  }
  return keccak_256(concatBytes2(...parts));
}
function signEip712(typedData, priv) {
  const domainHash = hashStruct("EIP712Domain", typedData.domain, typedData.types);
  const messageHash = hashStruct(typedData.primaryType, typedData.message, typedData.types);
  const raw = new Uint8Array(2 + 32 + 32);
  raw[0] = 25;
  raw[1] = 1;
  raw.set(domainHash, 2);
  raw.set(messageHash, 34);
  const digest = keccak_256(raw);
  const sig = secp256k1.sign(digest, priv);
  const r = sig.r.toString(16).padStart(64, "0");
  const s = sig.s.toString(16).padStart(64, "0");
  const v = (sig.recovery + 27).toString(16).padStart(2, "0");
  return `0x${r}${s}${v}`;
}
function deriveKeyLocally(signatureHex) {
  const sig = signatureHex.startsWith("0x") ? signatureHex.slice(2) : signatureHex;
  return crypto4.createHash("sha256").update(Buffer.from(sig, "hex")).digest("hex");
}
function readCache(walletAddress, apiUrl) {
  const raw = readJsonFile(DERIVE_SESSION_FILE, null);
  if (!raw || typeof raw !== "object") return null;
  if (raw.error) return null;
  const sessionId = raw.session_id ?? raw.sessionId;
  const keyHex = raw.key_hex ?? raw.keyHex;
  const address = raw.address ?? "";
  if (!sessionId || !keyHex) return null;
  if (address && address.toLowerCase() !== walletAddress.toLowerCase()) return null;
  if (typeof raw.api_url === "string" && raw.api_url && raw.api_url !== apiUrl) return null;
  let expiresAtMs = 0;
  if (typeof raw.expiresAt === "number") expiresAtMs = raw.expiresAt;
  else if (typeof raw.expires_at === "number") expiresAtMs = raw.expires_at * 1e3;
  if (expiresAtMs <= Date.now() + 6e4) return null;
  return { sessionId, keyHex, expiresAtMs, address: address || walletAddress };
}
function writeCache(session, apiUrl) {
  try {
    writeJsonFileAtomic(DERIVE_SESSION_FILE, {
      // legacy-plugin shape
      session_id: session.sessionId,
      key_hex: session.keyHex,
      expires_at: Math.floor(session.expiresAtMs / 1e3),
      address: session.address,
      api_url: apiUrl,
      // codex-hook shape
      sessionId: session.sessionId,
      keyHex: session.keyHex,
      expiresAt: session.expiresAtMs
    });
  } catch {
  }
}
async function getDeriveHeaders(config) {
  const walletAddress = addressFromPrivateKey(config.privateKey);
  const cached = readCache(walletAddress, config.apiUrl);
  if (cached) {
    return {
      "X-Wallet-Address": walletAddress,
      "X-Derive-Session-Id": cached.sessionId,
      "X-Derive-Key": cached.keyHex
    };
  }
  const base = config.apiUrl.replace(/\/$/, "");
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (config.apiKey) headers["X-KF-API-Key"] = config.apiKey;
  const challengeRes = await fetch(`${base}/api/v1/auth/derive-challenge`, { method: "POST", headers });
  if (!challengeRes.ok) {
    throw new Error(`derive-challenge failed: ${challengeRes.status} ${await challengeRes.text()}`);
  }
  const challenge = await challengeRes.json();
  const typedData = typeof challenge.typed_data === "string" ? JSON.parse(challenge.typed_data) : challenge.typed_data;
  const priv = normalizePrivateKey(config.privateKey);
  const signature = signEip712(typedData, priv);
  const deriveRes = await fetch(`${base}/api/v1/auth/derive-key`, {
    method: "POST",
    headers,
    body: JSON.stringify({ challenge_id: challenge.challenge_id, signature, address: walletAddress })
  });
  if (!deriveRes.ok) {
    throw new Error(`derive-key failed: ${deriveRes.status} ${await deriveRes.text()}`);
  }
  const derive = await deriveRes.json();
  const expiresAtMs = derive.expires_at ? Number(derive.expires_at) * 1e3 : Date.now() + 2 * 60 * 60 * 1e3;
  const session = {
    sessionId: derive.session_id,
    keyHex: derive.key_hex || deriveKeyLocally(signature),
    expiresAtMs,
    address: derive.wallet_address || walletAddress
  };
  writeCache(session, config.apiUrl);
  return {
    "X-Wallet-Address": walletAddress,
    "X-Derive-Session-Id": session.sessionId,
    "X-Derive-Key": session.keyHex
  };
}

// src/lib/queue.ts
import fs7 from "node:fs";
import path6 from "node:path";
import { createHash as createHash8 } from "node:crypto";

// src/lib/http.ts
async function requestJson(url, body, headers, timeoutMs = 15e3, method = "POST") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: response.ok, status: response.status, text, json };
  } finally {
    clearTimeout(timer);
  }
}
function postJson(url, body, headers, timeoutMs = 15e3, method = "POST") {
  return requestJson(url, body, headers, timeoutMs, method);
}
function putJson(url, body, headers, timeoutMs = 15e3) {
  return requestJson(url, body, headers, timeoutMs, "PUT");
}

// node_modules/rickydata/dist/kfdb/agent-chat-trace.js
import { createHash, randomUUID } from "node:crypto";
var KG_NAMESPACE = uuidV5("rickydata-agent-chat-knowledge-graph-v1", "6ba7b811-9dad-11d1-80b4-00c04fd430c8");
var EXECUTION_KG_NAMESPACE = uuidV5("rickydata-execution-knowledge-graph-v1", "6ba7b811-9dad-11d1-80b4-00c04fd430c8");
function uuidV5(name, namespace) {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  if (ns.length !== 16)
    throw new Error("Invalid UUID namespace");
  const hash = createHash("sha1").update(Buffer.concat([ns, Buffer.from(name)])).digest();
  hash[6] = hash[6] & 15 | 80;
  hash[8] = hash[8] & 63 | 128;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// node_modules/rickydata/dist/kfdb/claude-code-hook-trace.js
import { createHash as createHash4, randomUUID as randomUUID2 } from "node:crypto";

// node_modules/rickydata/dist/kfdb/decision-pack-v1.js
import { createHash as createHash3 } from "node:crypto";

// node_modules/rickydata/dist/kfdb/rickydata-graph.js
import { createHash as createHash2 } from "node:crypto";
var RICKYDATA_GRAPH_NAMESPACE = "2f3e8ab8-8684-5c6a-9fd2-c5467b94251d";
var RICKYDATA_GRAPH_SCHEMA_VERSION = "rickydata.repo_execution_graph.v1";
var GraphEntityKind;
(function(GraphEntityKind2) {
  GraphEntityKind2["Repository"] = "Repository";
  GraphEntityKind2["Commit"] = "Commit";
  GraphEntityKind2["File"] = "File";
  GraphEntityKind2["Function"] = "Function";
  GraphEntityKind2["TypeDefinition"] = "TypeDefinition";
  GraphEntityKind2["TestCase"] = "TestCase";
  GraphEntityKind2["Symbol"] = "Symbol";
  GraphEntityKind2["Dependency"] = "Dependency";
  GraphEntityKind2["GitHubIssue"] = "GitHubIssue";
  GraphEntityKind2["GitHubProjectItem"] = "GitHubProjectItem";
  GraphEntityKind2["GitHubPullRequest"] = "GitHubPullRequest";
  GraphEntityKind2["RickydataWorkIntent"] = "RickydataWorkIntent";
  GraphEntityKind2["RickydataAttempt"] = "RickydataAttempt";
  GraphEntityKind2["RickydataRun"] = "RickydataRun";
  GraphEntityKind2["RickydataPatch"] = "RickydataPatch";
  GraphEntityKind2["RickydataProof"] = "RickydataProof";
  GraphEntityKind2["CIJob"] = "CIJob";
  GraphEntityKind2["AgentSession"] = "AgentSession";
  GraphEntityKind2["AgentTraceEvent"] = "AgentTraceEvent";
  GraphEntityKind2["RelaySnapshot"] = "RelaySnapshot";
  GraphEntityKind2["KfdbProjection"] = "KfdbProjection";
  GraphEntityKind2["UnderstandingSummary"] = "UnderstandingSummary";
  GraphEntityKind2["CodeConcept"] = "CodeConcept";
  GraphEntityKind2["DesignDecision"] = "DesignDecision";
  GraphEntityKind2["RickydataProductEntity"] = "RickydataProductEntity";
  GraphEntityKind2["RoadmapItem"] = "RoadmapItem";
  GraphEntityKind2["EvidenceRecord"] = "EvidenceRecord";
  GraphEntityKind2["PriorityScoreSnapshot"] = "PriorityScoreSnapshot";
  GraphEntityKind2["AlignmentReviewItem"] = "AlignmentReviewItem";
  GraphEntityKind2["DecisionRecord"] = "DecisionRecord";
  GraphEntityKind2["RoadmapSnapshot"] = "RoadmapSnapshot";
  GraphEntityKind2["AgentContextPack"] = "AgentContextPack";
  GraphEntityKind2["EvidenceRequirement"] = "EvidenceRequirement";
  GraphEntityKind2["EvidenceBundle"] = "EvidenceBundle";
  GraphEntityKind2["ReleaseGate"] = "ReleaseGate";
  GraphEntityKind2["LearningItem"] = "LearningItem";
  GraphEntityKind2["BenchmarkRunProof"] = "BenchmarkRunProof";
  GraphEntityKind2["DecisionPack"] = "DecisionPack";
  GraphEntityKind2["DecisionSourceReceipt"] = "DecisionSourceReceipt";
  GraphEntityKind2["ContextDeliveryReceipt"] = "ContextDeliveryReceipt";
  GraphEntityKind2["DecisionObservation"] = "DecisionObservation";
  GraphEntityKind2["ObjectiveObservation"] = "ObjectiveObservation";
  GraphEntityKind2["RepositoryStateReceipt"] = "RepositoryStateReceipt";
  GraphEntityKind2["VerificationObservation"] = "VerificationObservation";
  GraphEntityKind2["RunUsageReceipt"] = "RunUsageReceipt";
  GraphEntityKind2["RunOutcomeReceipt"] = "RunOutcomeReceipt";
  GraphEntityKind2["ContentArtifact"] = "ContentArtifact";
  GraphEntityKind2["SessionArtifactManifest"] = "SessionArtifactManifest";
  GraphEntityKind2["OpenQuestion"] = "OpenQuestion";
})(GraphEntityKind || (GraphEntityKind = {}));
var GraphEdgeType;
(function(GraphEdgeType2) {
  GraphEdgeType2["Contains"] = "CONTAINS";
  GraphEdgeType2["HasCommit"] = "HAS_COMMIT";
  GraphEdgeType2["Defines"] = "DEFINES";
  GraphEdgeType2["Imports"] = "IMPORTS";
  GraphEdgeType2["Calls"] = "CALLS";
  GraphEdgeType2["Tests"] = "TESTS";
  GraphEdgeType2["DependsOn"] = "DEPENDS_ON";
  GraphEdgeType2["Touches"] = "TOUCHES";
  GraphEdgeType2["Mentions"] = "MENTIONS";
  GraphEdgeType2["Implements"] = "IMPLEMENTS";
  GraphEdgeType2["DerivedFromIssue"] = "DERIVED_FROM_ISSUE";
  GraphEdgeType2["ProducedBy"] = "PRODUCED_BY";
  GraphEdgeType2["Proves"] = "PROVES";
  GraphEdgeType2["FailedBy"] = "FAILED_BY";
  GraphEdgeType2["Supersedes"] = "SUPERSEDES";
  GraphEdgeType2["Blocks"] = "BLOCKS";
  GraphEdgeType2["Unblocks"] = "UNBLOCKS";
  GraphEdgeType2["SupportedBy"] = "SUPPORTED_BY";
  GraphEdgeType2["VerifiedBy"] = "VERIFIED_BY";
  GraphEdgeType2["ProjectedToKfdb"] = "PROJECTED_TO_KFDB";
  GraphEdgeType2["SyncedToRelay"] = "SYNCED_TO_RELAY";
  GraphEdgeType2["Summarizes"] = "SUMMARIZES";
  GraphEdgeType2["AboutProductEntity"] = "ABOUT_PRODUCT_ENTITY";
  GraphEdgeType2["RequiresEvidence"] = "REQUIRES_EVIDENCE";
  GraphEdgeType2["SatisfiesRequirement"] = "SATISFIES_REQUIREMENT";
  GraphEdgeType2["BundlesEvidence"] = "BUNDLES_EVIDENCE";
  GraphEdgeType2["CapturesPriority"] = "CAPTURES_PRIORITY";
  GraphEdgeType2["ReviewedForAlignment"] = "REVIEWED_FOR_ALIGNMENT";
  GraphEdgeType2["RecordsDecision"] = "RECORDS_DECISION";
  GraphEdgeType2["SnapshotsRoadmap"] = "SNAPSHOTS_ROADMAP";
  GraphEdgeType2["ProvidesContext"] = "PROVIDES_CONTEXT";
  GraphEdgeType2["GatesRelease"] = "GATES_RELEASE";
  GraphEdgeType2["CapturesLearning"] = "CAPTURES_LEARNING";
  GraphEdgeType2["SatisfiesWorkIntent"] = "SATISFIES_WORK_INTENT";
  GraphEdgeType2["ProvenByBenchmark"] = "PROVEN_BY_BENCHMARK";
  GraphEdgeType2["GeneratedBySession"] = "GENERATED_BY_SESSION";
  GraphEdgeType2["PacksSubject"] = "PACKS_SUBJECT";
  GraphEdgeType2["IncludesArtifact"] = "INCLUDES_ARTIFACT";
  GraphEdgeType2["HasArtifactManifest"] = "HAS_ARTIFACT_MANIFEST";
  GraphEdgeType2["HasSourceReceipt"] = "HAS_SOURCE_RECEIPT";
  GraphEdgeType2["ScoresPack"] = "SCORES_PACK";
  GraphEdgeType2["DecidesWithPack"] = "DECIDES_WITH_PACK";
  GraphEdgeType2["DeliveredToSession"] = "DELIVERED_TO_SESSION";
  GraphEdgeType2["DeliversPack"] = "DELIVERS_PACK";
  GraphEdgeType2["ObservedInSession"] = "OBSERVED_IN_SESSION";
  GraphEdgeType2["ObservedAgainstPack"] = "OBSERVED_AGAINST_PACK";
  GraphEdgeType2["GovernedByContract"] = "GOVERNED_BY_CONTRACT";
  GraphEdgeType2["ObservedRepositoryState"] = "OBSERVED_REPOSITORY_STATE";
  GraphEdgeType2["VerifiesContract"] = "VERIFIES_CONTRACT";
  GraphEdgeType2["MeasuresRun"] = "MEASURES_RUN";
  GraphEdgeType2["ReportsOutcome"] = "REPORTS_OUTCOME";
  GraphEdgeType2["UsesUsageReceipt"] = "USES_USAGE_RECEIPT";
})(GraphEdgeType || (GraphEdgeType = {}));
var ENTITY_ID_PARTS = {
  [GraphEntityKind.Repository]: ["canonical_repo_ref"],
  [GraphEntityKind.Commit]: ["repo_id", "commit_sha"],
  [GraphEntityKind.File]: ["repo_id", "commit_sha", "path", "content_hash"],
  [GraphEntityKind.Function]: ["file_id", "function_name", "span_hash"],
  [GraphEntityKind.TypeDefinition]: ["file_id", "type_name", "span_hash"],
  [GraphEntityKind.TestCase]: ["file_id", "test_name", "span_hash"],
  [GraphEntityKind.Symbol]: ["repo_id", "commit_sha", "path", "symbol_path", "span_hash"],
  [GraphEntityKind.Dependency]: ["repo_id", "commit_sha", "dependency_name", "dependency_version"],
  [GraphEntityKind.GitHubIssue]: ["repo_id", "issue_number"],
  [GraphEntityKind.GitHubProjectItem]: ["repo_id", "project_item_id"],
  [GraphEntityKind.GitHubPullRequest]: ["repo_id", "pull_request_number"],
  [GraphEntityKind.RickydataWorkIntent]: ["repo_id", "intent_id"],
  [GraphEntityKind.RickydataAttempt]: ["repo_id", "attempt_id"],
  [GraphEntityKind.RickydataRun]: ["repo_id", "run_id"],
  [GraphEntityKind.RickydataPatch]: ["repo_id", "patch_id"],
  [GraphEntityKind.RickydataProof]: ["repo_id", "proof_id"],
  [GraphEntityKind.CIJob]: ["repo_id", "provider", "run_id", "job_id"],
  [GraphEntityKind.AgentSession]: ["repo_id", "session_id"],
  [GraphEntityKind.AgentTraceEvent]: ["repo_id", "session_id", "event_id"],
  [GraphEntityKind.RelaySnapshot]: ["repo_id", "remote", "ref_name", "object_id"],
  [GraphEntityKind.KfdbProjection]: ["repo_id", "projection_id"],
  [GraphEntityKind.UnderstandingSummary]: ["repo_id", "commit_sha", "scope", "summary_hash"],
  [GraphEntityKind.CodeConcept]: ["repo_id", "concept_name", "source_hash"],
  [GraphEntityKind.DesignDecision]: ["repo_id", "decision_id"],
  [GraphEntityKind.RickydataProductEntity]: ["repo_id", "product_entity_id"],
  [GraphEntityKind.RoadmapItem]: ["repo_id", "roadmap_item_id"],
  [GraphEntityKind.EvidenceRecord]: ["repo_id", "evidence_record_id"],
  [GraphEntityKind.PriorityScoreSnapshot]: ["repo_id", "subject_id", "snapshot_id"],
  [GraphEntityKind.AlignmentReviewItem]: ["repo_id", "review_item_id"],
  [GraphEntityKind.DecisionRecord]: ["repo_id", "decision_record_id"],
  [GraphEntityKind.RoadmapSnapshot]: ["repo_id", "roadmap_snapshot_id"],
  [GraphEntityKind.AgentContextPack]: ["repo_id", "context_pack_id"],
  [GraphEntityKind.EvidenceRequirement]: ["repo_id", "evidence_requirement_id"],
  [GraphEntityKind.EvidenceBundle]: ["repo_id", "evidence_bundle_id"],
  [GraphEntityKind.ReleaseGate]: ["repo_id", "release_gate_id"],
  [GraphEntityKind.LearningItem]: ["repo_id", "learning_item_id"],
  [GraphEntityKind.BenchmarkRunProof]: ["repo_id", "benchmark_run_id", "proof_id"],
  [GraphEntityKind.DecisionPack]: ["wallet_address", "pack_key"],
  [GraphEntityKind.DecisionSourceReceipt]: ["decision_pack_id", "source", "receipt_key"],
  [GraphEntityKind.ContextDeliveryReceipt]: ["session_node_id", "delivery_key"],
  [GraphEntityKind.DecisionObservation]: ["session_node_id", "observation_key"],
  [GraphEntityKind.ObjectiveObservation]: ["session_node_id", "observation_key"],
  [GraphEntityKind.RepositoryStateReceipt]: ["session_node_id", "receipt_key"],
  [GraphEntityKind.VerificationObservation]: ["work_contract_id", "verification_key"],
  [GraphEntityKind.RunUsageReceipt]: ["run_node_id", "receipt_key"],
  [GraphEntityKind.RunOutcomeReceipt]: ["run_node_id", "receipt_key"],
  [GraphEntityKind.ContentArtifact]: ["content_hash", "media_type"],
  [GraphEntityKind.SessionArtifactManifest]: ["session_node_id", "turn_node_id"],
  // memory-v1: same `(source_ref, question)` ⇒ same id ⇒ idempotent merge.
  [GraphEntityKind.OpenQuestion]: ["source_ref", "question"]
};
function deriveRickydataGraphId(entity, parts) {
  const expected = ENTITY_ID_PARTS[entity];
  if (!expected)
    throw new Error(`Unsupported Rickydata graph entity kind: ${entity}`);
  if (parts.length !== expected.length) {
    throw new Error(`${entity} expected ${expected.length} parts (${expected.join(", ")}) but received ${parts.length}`);
  }
  const normalizedParts = parts.map((part, idx) => {
    const normalized = String(part).trim();
    if (normalized.length === 0) {
      throw new Error(`${entity} id part '${expected[idx]}' at position ${idx} must not be empty`);
    }
    return normalized;
  });
  return uuidV52(`${RICKYDATA_GRAPH_SCHEMA_VERSION}:${[entity, ...normalizedParts].join("")}`, RICKYDATA_GRAPH_NAMESPACE);
}
function deriveRickydataGraphEdgeId(from, edgeType, to) {
  const normalizedFrom = from.trim();
  const normalizedTo = to.trim();
  if (!normalizedFrom || !normalizedTo)
    throw new Error("edge endpoints must not be empty");
  return uuidV52(`${RICKYDATA_GRAPH_SCHEMA_VERSION}:edge:${normalizedFrom}${edgeType}${normalizedTo}`, RICKYDATA_GRAPH_NAMESPACE);
}
function rickydataGraphValue(input) {
  if (input === null || input === void 0)
    return { Null: null };
  if (typeof input === "boolean")
    return { Boolean: input };
  if (typeof input === "number")
    return Number.isInteger(input) ? { Integer: input } : { Float: input };
  if (Array.isArray(input))
    return { Array: input.map(rickydataGraphValue) };
  if (typeof input === "object") {
    return {
      Object: Object.fromEntries(Object.entries(input).map(([key, value3]) => [key, rickydataGraphValue(value3)]))
    };
  }
  return { String: String(input) };
}
function uuidV52(name, namespace) {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  if (ns.length !== 16)
    throw new Error("Invalid UUID namespace");
  const hash = createHash2("sha1").update(Buffer.concat([ns, Buffer.from(name)])).digest();
  hash[6] = hash[6] & 15 | 80;
  hash[8] = hash[8] & 63 | 128;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// node_modules/rickydata/dist/kfdb/decision-pack-v1.js
var DECISION_PACK_CONTRACT_VERSION = "rickydata.decision_pack.v1";
var CONTENT_ARTIFACT_CONTRACT_VERSION = "content-artifact/v1";
var CONTENT_ARTIFACT_MANIFEST_CONTRACT_VERSION = "content-artifact-manifest/v1";
var CONTENT_ARTIFACT_MAX_INLINE_BYTES = 256 * 1024;
var DecisionPackNodeLabel = {
  DecisionPack: GraphEntityKind.DecisionPack,
  DecisionSourceReceipt: GraphEntityKind.DecisionSourceReceipt,
  ContextDeliveryReceipt: GraphEntityKind.ContextDeliveryReceipt,
  DecisionObservation: GraphEntityKind.DecisionObservation,
  ContentArtifact: GraphEntityKind.ContentArtifact
};
var DecisionPackEdgeType = {
  PacksSubject: GraphEdgeType.PacksSubject,
  IncludesArtifact: GraphEdgeType.IncludesArtifact,
  HasSourceReceipt: GraphEdgeType.HasSourceReceipt,
  ScoresPack: GraphEdgeType.ScoresPack,
  DecidesWithPack: GraphEdgeType.DecidesWithPack,
  DeliveredToSession: GraphEdgeType.DeliveredToSession,
  DeliversPack: GraphEdgeType.DeliversPack,
  ObservedInSession: GraphEdgeType.ObservedInSession,
  ObservedAgainstPack: GraphEdgeType.ObservedAgainstPack
};
function sha256Hex2(content) {
  return createHash3("sha256").update(content, "utf8").digest("hex");
}
function assertNonEmpty(value3, field) {
  const normalized = value3.trim();
  if (!normalized)
    throw new Error(`${field} must not be empty`);
  return normalized;
}
function assertHash(value3, field) {
  if (!/^sha256:[0-9a-f]{64}$/.test(value3))
    throw new Error(`${field} must be sha256:<64 lowercase hex>`);
}
function node(id, label, properties) {
  return {
    operation: "create_node",
    id,
    label,
    mode: "merge",
    properties: Object.fromEntries(Object.entries({ contract_version: DECISION_PACK_CONTRACT_VERSION, ...properties }).filter(([, value3]) => value3 !== void 0).map(([key, value3]) => [key, rickydataGraphValue(value3)]))
  };
}
function edge(from, edgeType, to, properties = {}) {
  assertNonEmpty(from, "edge.from");
  assertNonEmpty(to, "edge.to");
  return {
    operation: "create_edge",
    id: deriveRickydataGraphEdgeId(from, edgeType, to),
    from,
    to,
    edge_type: edgeType,
    properties: Object.fromEntries(Object.entries({ contract_version: DECISION_PACK_CONTRACT_VERSION, ...properties }).filter(([, value3]) => value3 !== void 0).map(([key, value3]) => [key, rickydataGraphValue(value3)]))
  };
}
function deriveContentArtifactId(contentHash, mediaType) {
  assertHash(contentHash, "contentHash");
  return deriveRickydataGraphId(GraphEntityKind.ContentArtifact, [contentHash, assertNonEmpty(mediaType, "mediaType")]);
}
function buildContentArtifactOperations(input) {
  const content = input.content;
  const mediaType = assertNonEmpty(input.mediaType, "mediaType");
  const observableKind = assertNonEmpty(input.observableKind, "observableKind");
  const hex = sha256Hex2(content);
  const contentHash = `sha256:${hex}`;
  const uri = `content-artifact:${contentHash}`;
  const artifactId = deriveContentArtifactId(contentHash, mediaType);
  const byteLength = Buffer.byteLength(content, "utf8");
  const ref = {
    artifactId,
    uri,
    contentHash,
    byteLength,
    mediaType,
    observableKind,
    storage: "kfdb-private-kv",
    encryption: { scheme: "kfdb-s2d", scope: "wallet-private" },
    chunkCount: 1,
    ...input.sourceRef ? { sourceRef: input.sourceRef } : {}
  };
  const chunks = splitUtf8(content, CONTENT_ARTIFACT_MAX_INLINE_BYTES);
  ref.chunkCount = chunks.length;
  const chunkArtifacts = chunks.map((chunk) => {
    const chunkHash = `sha256:${sha256Hex2(chunk)}`;
    return {
      key: `content-artifact:${chunkHash}`,
      ifAbsent: true,
      value: {
        contractVersion: CONTENT_ARTIFACT_CONTRACT_VERSION,
        contentHash: chunkHash,
        byteLength: Buffer.byteLength(chunk, "utf8"),
        content: chunk
      }
    };
  });
  const artifact = chunks.length === 1 ? chunkArtifacts[0] : {
    key: uri,
    ifAbsent: true,
    value: {
      contractVersion: CONTENT_ARTIFACT_MANIFEST_CONTRACT_VERSION,
      contentHash,
      byteLength,
      chunks: chunkArtifacts.map((chunk) => ({
        uri: chunk.key,
        contentHash: chunk.value.contentHash,
        byteLength: chunk.value.byteLength
      }))
    }
  };
  const artifacts = chunks.length === 1 ? [artifact] : [...chunkArtifacts, artifact];
  return {
    ref,
    artifact,
    operations: [node(artifactId, DecisionPackNodeLabel.ContentArtifact, {
      uri,
      content_hash: contentHash,
      byte_length: byteLength,
      media_type: mediaType,
      observable_kind: observableKind,
      storage: ref.storage,
      encryption_scheme: ref.encryption.scheme,
      encryption_scope: ref.encryption.scope,
      observable_only: true,
      chunk_count: ref.chunkCount,
      source_ref: input.sourceRef
    })],
    artifacts
  };
}
function splitUtf8(content, maxBytes) {
  if (Buffer.byteLength(content, "utf8") <= maxBytes)
    return [content];
  const chunks = [];
  let current = "";
  let currentBytes = 0;
  for (const character of content) {
    const bytes = Buffer.byteLength(character, "utf8");
    if (currentBytes + bytes > maxBytes && current) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += character;
    currentBytes += bytes;
  }
  if (current || chunks.length === 0)
    chunks.push(current);
  if (chunks.length > 4096)
    throw new Error("observable content exceeds the 4096-chunk artifact limit");
  return chunks;
}
function buildContextDeliveryReceiptOperations(input) {
  if (input.packHash)
    assertHash(input.packHash, "packHash");
  if (input.policyHash)
    assertHash(input.policyHash, "policyHash");
  if (input.selectedManifestHash)
    assertHash(input.selectedManifestHash, "selectedManifestHash");
  const receiptId = deriveRickydataGraphId(GraphEntityKind.ContextDeliveryReceipt, [
    assertNonEmpty(input.session.nodeId, "session.nodeId"),
    assertNonEmpty(input.deliveryKey, "deliveryKey")
  ]);
  const operations = [
    node(receiptId, DecisionPackNodeLabel.ContextDeliveryReceipt, {
      delivery_key: input.deliveryKey,
      session_label: input.session.label,
      pack_id: input.packId,
      pack_hash: input.packHash,
      rendered_artifact: input.renderedArtifact,
      rendered_context_hash: input.renderedArtifact.contentHash,
      rendered_byte_length: input.renderedArtifact.byteLength,
      interface: input.interface,
      coverage_status: input.coverageStatus,
      omissions: input.omissions,
      delivered_at: input.deliveredAt,
      policy_hash: input.policyHash,
      selected_manifest_hash: input.selectedManifestHash,
      corpus_watermark: input.corpusWatermark
    }),
    edge(receiptId, GraphEdgeType.DeliveredToSession, input.session.nodeId, { session_label: input.session.label }),
    edge(receiptId, GraphEdgeType.IncludesArtifact, input.renderedArtifact.artifactId, { role: "rendered-context" })
  ];
  if (input.packId)
    operations.push(edge(receiptId, GraphEdgeType.DeliversPack, input.packId));
  return { receiptId, operations };
}
function buildDecisionObservationOperations(input) {
  const observationId = deriveRickydataGraphId(GraphEntityKind.DecisionObservation, [
    assertNonEmpty(input.session.nodeId, "session.nodeId"),
    assertNonEmpty(input.observationKey, "observationKey")
  ]);
  const operations = [
    node(observationId, DecisionPackNodeLabel.DecisionObservation, {
      observation_key: input.observationKey,
      kind: input.kind,
      interface: input.interface,
      actor: input.actor,
      question_artifact: input.questionArtifact,
      options_artifact: input.optionsArtifact,
      rationale_artifact: input.rationaleArtifact,
      options_presented: input.optionsPresented,
      selected_option: input.selectedOption,
      policy_ref: input.policyRef,
      observed_at: input.observedAt,
      pack_id: input.packId
    }),
    edge(observationId, GraphEdgeType.ObservedInSession, input.session.nodeId, { session_label: input.session.label }),
    edge(observationId, GraphEdgeType.IncludesArtifact, input.questionArtifact.artifactId, { role: "question" })
  ];
  if (input.optionsArtifact)
    operations.push(edge(observationId, GraphEdgeType.IncludesArtifact, input.optionsArtifact.artifactId, { role: "options" }));
  if (input.rationaleArtifact)
    operations.push(edge(observationId, GraphEdgeType.IncludesArtifact, input.rationaleArtifact.artifactId, { role: "rationale" }));
  if (input.packId)
    operations.push(edge(observationId, GraphEdgeType.ObservedAgainstPack, input.packId));
  return { observationId, operations };
}

// node_modules/rickydata/dist/kfdb/session-artifact-manifest.js
var SESSION_ARTIFACT_MANIFEST_CONTRACT_VERSION = "rickydata.session_artifact_manifest.v1";
var SESSION_ARTIFACT_MANIFEST_MEDIA_TYPE = "application/vnd.rickydata.session-artifact-manifest+json; version=1";
function nonEmpty(input, field) {
  const value3 = input.trim();
  if (!value3)
    throw new Error(`${field} must not be empty`);
  return value3;
}
function manifestDocument(input) {
  const entries = input.entries.map((entry, insertionIndex) => ({ entry, insertionIndex })).sort((left, right) => left.entry.sequence - right.entry.sequence || left.insertionIndex - right.insertionIndex).map(({ entry }) => ({
    sequence: entry.sequence,
    eventType: nonEmpty(entry.eventType, "entry.eventType"),
    receivedAt: entry.receivedAt,
    role: nonEmpty(entry.role, "entry.role"),
    ...entry.toolName ? { toolName: entry.toolName } : {},
    ...entry.toolUseId ? { toolUseId: entry.toolUseId } : {},
    artifact: entry.artifact
  }));
  return {
    contractVersion: SESSION_ARTIFACT_MANIFEST_CONTRACT_VERSION,
    engine: input.engine,
    runtime: {
      agentId: nonEmpty(input.runtime.agentId, "runtime.agentId"),
      ...input.runtime.model ? { model: input.runtime.model } : {},
      ...input.runtime.cwd ? { cwd: input.runtime.cwd } : {}
    },
    session: {
      nodeId: nonEmpty(input.session.nodeId, "session.nodeId"),
      label: nonEmpty(input.session.label, "session.label"),
      externalSessionId: nonEmpty(input.session.externalSessionId, "session.externalSessionId")
    },
    turn: {
      nodeId: nonEmpty(input.turn.nodeId, "turn.nodeId"),
      label: nonEmpty(input.turn.label, "turn.label"),
      ...input.turn.externalTurnId ? { externalTurnId: input.turn.externalTurnId } : {},
      index: input.turn.index,
      startedAt: input.turn.startedAt,
      completedAt: input.turn.completedAt
    },
    ...input.repository ? { repository: input.repository } : {},
    entries
  };
}
function buildSessionArtifactManifestOperations(input) {
  const manifest = manifestDocument(input);
  const content = JSON.stringify(manifest);
  const built = buildContentArtifactOperations({
    content,
    mediaType: SESSION_ARTIFACT_MANIFEST_MEDIA_TYPE,
    observableKind: "session-artifact-manifest",
    sourceRef: `session-artifact-manifest:${input.engine}:${manifest.session.externalSessionId}:${manifest.turn.index}`
  });
  const manifestId = deriveRickydataGraphId(GraphEntityKind.SessionArtifactManifest, [
    manifest.session.nodeId,
    manifest.turn.nodeId
  ]);
  const operations = [
    ...built.operations,
    {
      operation: "create_node",
      id: manifestId,
      label: GraphEntityKind.SessionArtifactManifest,
      mode: "merge",
      properties: {
        contract_version: rickydataGraphValue(SESSION_ARTIFACT_MANIFEST_CONTRACT_VERSION),
        engine: rickydataGraphValue(manifest.engine),
        agent_id: rickydataGraphValue(manifest.runtime.agentId),
        model: rickydataGraphValue(manifest.runtime.model),
        cwd: rickydataGraphValue(manifest.runtime.cwd),
        session_node_id: rickydataGraphValue(manifest.session.nodeId),
        session_label: rickydataGraphValue(manifest.session.label),
        external_session_id: rickydataGraphValue(manifest.session.externalSessionId),
        turn_node_id: rickydataGraphValue(manifest.turn.nodeId),
        turn_label: rickydataGraphValue(manifest.turn.label),
        external_turn_id: rickydataGraphValue(manifest.turn.externalTurnId),
        turn_index: rickydataGraphValue(manifest.turn.index),
        started_at: rickydataGraphValue(manifest.turn.startedAt),
        completed_at: rickydataGraphValue(manifest.turn.completedAt),
        entry_count: rickydataGraphValue(manifest.entries.length),
        repository: rickydataGraphValue(manifest.repository),
        manifest_artifact: rickydataGraphValue(built.ref),
        manifest_content_hash: rickydataGraphValue(built.ref.contentHash)
      }
    },
    {
      operation: "create_edge",
      id: deriveRickydataGraphEdgeId(manifest.turn.nodeId, GraphEdgeType.HasArtifactManifest, manifestId),
      from: manifest.turn.nodeId,
      to: manifestId,
      edge_type: GraphEdgeType.HasArtifactManifest,
      properties: {
        contract_version: rickydataGraphValue(SESSION_ARTIFACT_MANIFEST_CONTRACT_VERSION),
        turn_index: rickydataGraphValue(manifest.turn.index)
      }
    },
    {
      operation: "create_edge",
      id: deriveRickydataGraphEdgeId(manifestId, GraphEdgeType.IncludesArtifact, built.ref.artifactId),
      from: manifestId,
      to: built.ref.artifactId,
      edge_type: GraphEdgeType.IncludesArtifact,
      properties: {
        contract_version: rickydataGraphValue(SESSION_ARTIFACT_MANIFEST_CONTRACT_VERSION),
        role: rickydataGraphValue("manifest-document"),
        content_hash: rickydataGraphValue(built.ref.contentHash)
      }
    }
  ];
  return {
    manifestId,
    manifest,
    manifestArtifact: built.ref,
    operations,
    contentArtifacts: built.artifacts
  };
}

// node_modules/rickydata/dist/kfdb/claude-code-hook-trace.js
var KG_NAMESPACE2 = uuidV53("rickydata-claude-code-hook-knowledge-graph-v1", "6ba7b811-9dad-11d1-80b4-00c04fd430c8");
var EXECUTION_KG_NAMESPACE2 = uuidV53("rickydata-execution-knowledge-graph-v1", "6ba7b811-9dad-11d1-80b4-00c04fd430c8");
var TRACE_SCHEMA_VERSION = 3;
function stableHash(input) {
  return createHash4("sha256").update(input).digest("hex");
}
function uuidV53(name, namespace) {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  if (ns.length !== 16)
    throw new Error("Invalid UUID namespace");
  const hash = createHash4("sha1").update(Buffer.concat([ns, Buffer.from(name)])).digest();
  hash[6] = hash[6] & 15 | 80;
  hash[8] = hash[8] & 63 | 128;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function deterministicId(kind, parts) {
  return uuidV53(`${kind}:${parts.map((p) => String(p)).join(":")}`, KG_NAMESPACE2);
}
function deterministicExecutionId(kind, parts) {
  return uuidV53(`${kind}:${parts.map((p) => String(p)).join(":")}`, EXECUTION_KG_NAMESPACE2);
}
function value(input) {
  if (input === null || input === void 0)
    return { Null: null };
  if (typeof input === "boolean")
    return { Boolean: input };
  if (typeof input === "number")
    return Number.isInteger(input) ? { Integer: input } : { Float: input };
  if (Array.isArray(input))
    return { Array: input.map(value) };
  if (typeof input === "object") {
    return { Object: Object.fromEntries(Object.entries(input).map(([k, v]) => [k, value(v)])) };
  }
  return { String: String(input) };
}
function stableJson(input) {
  if (input === null || input === void 0)
    return "null";
  if (typeof input !== "object")
    return JSON.stringify(input);
  if (Array.isArray(input))
    return `[${input.map(stableJson).join(",")}]`;
  return `{${Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
}
function summarizePayload(payload) {
  if (payload === void 0 || payload === null)
    return { value: payload ?? null };
  if (typeof payload === "string")
    return { contentLength: payload.length, contentHash: stableHash(payload) };
  const encoded = stableJson(payload);
  return { contentLength: encoded.length, contentHash: stableHash(encoded) };
}
function basename(input) {
  const normalized = input.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() ?? normalized;
}
function extension(input) {
  const name = basename(input);
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : "";
}
function collectFilePaths(input, output = /* @__PURE__ */ new Set()) {
  if (input === void 0 || input === null)
    return output;
  if (typeof input === "string") {
    for (const match of input.matchAll(/^\*{3} (?:Add|Update|Delete) File: (.+)$/gm)) {
      output.add(match[1].trim());
    }
    return output;
  }
  if (Array.isArray(input)) {
    input.forEach((item) => collectFilePaths(item, output));
    return output;
  }
  if (typeof input !== "object")
    return output;
  for (const [key, item] of Object.entries(input)) {
    const lowerKey = key.toLowerCase();
    if (typeof item === "string" && /(^|_)(file|path|filepath|filename)$/.test(lowerKey) && item.length > 0 && item.length < 1e3) {
      output.add(item);
    } else {
      collectFilePaths(item, output);
    }
  }
  return output;
}
function extractCommand(input) {
  if (typeof input === "string")
    return input;
  if (!input || typeof input !== "object")
    return null;
  const record2 = input;
  for (const key of ["command", "cmd", "script"]) {
    if (typeof record2[key] === "string" && record2[key])
      return record2[key];
  }
  return null;
}
function summarizeCommand(command) {
  const firstLine = command.split(/\r?\n/, 1)[0] ?? "";
  return {
    command_hash: stableHash(command),
    command_length: command.length,
    command_preview: firstLine.slice(0, 240)
  };
}
function eventData(event, contentArtifacts) {
  return {
    hookEventName: event.hookEventName,
    claudeSessionId: event.claudeSessionId,
    transcriptPath: event.transcriptPath,
    cwd: event.cwd,
    model: event.model,
    source: event.source,
    receivedAt: event.receivedAt,
    promptHash: event.prompt ? stableHash(event.prompt) : void 0,
    promptLength: event.prompt?.length,
    reason: event.reason,
    stopHookActive: event.stopHookActive,
    toolName: event.toolName,
    toolUseId: event.toolUseId,
    toolInput: event.toolInput === void 0 ? void 0 : summarizePayload(event.toolInput),
    toolResponse: event.toolResponse === void 0 ? void 0 : summarizePayload(event.toolResponse),
    permissionDecision: event.permissionDecision,
    permissionDecisionReason: event.permissionDecisionReason,
    exitCode: event.exitCode,
    stdout: event.stdout === void 0 ? void 0 : summarizePayload(event.stdout),
    stderr: event.stderr === void 0 ? void 0 : summarizePayload(event.stderr),
    durationMs: event.durationMs,
    contentArtifacts,
    decisionKind: event.decisionKind,
    decisionQuestion: event.decisionQuestion,
    decisionOptions: event.decisionOptions,
    decisionAnswer: event.decisionAnswer,
    decisionPolicyRef: event.decisionPolicyRef,
    hookPayload: event.hookPayload === void 0 ? void 0 : summarizePayload(event.hookPayload),
    contextDelivery: event.contextDelivery === void 0 ? void 0 : {
      ...event.contextDelivery,
      renderedContent: summarizePayload(event.contextDelivery.renderedContent)
    },
    repository: event.repository,
    workContract: event.workContract,
    sourceIntentRef: event.sourceIntentRef
  };
}
function addWorkspaceOperations(operations, sourceNodeId, cwd) {
  if (!cwd)
    return;
  const workspaceNodeId = deterministicExecutionId("CodeWorkspace", [cwd]);
  operations.push({
    operation: "create_node",
    id: workspaceNodeId,
    label: "CodeWorkspace",
    mode: "merge",
    properties: {
      path: value(cwd),
      path_hash: value(stableHash(cwd)),
      basename: value(basename(cwd)),
      schema_version: value(TRACE_SCHEMA_VERSION)
    }
  }, {
    operation: "create_edge",
    id: deterministicId("RAN_IN_WORKSPACE", [sourceNodeId, workspaceNodeId]),
    from: sourceNodeId,
    to: workspaceNodeId,
    edge_type: "RAN_IN_WORKSPACE",
    properties: { source: value("claude-code-hooks") }
  });
}
function addCodeFileOperations(operations, sourceNodeId, paths) {
  [...new Set(paths)].forEach((filePath) => {
    const fileNodeId = deterministicExecutionId("CodeFile", [filePath]);
    operations.push({
      operation: "create_node",
      id: fileNodeId,
      label: "CodeFile",
      mode: "merge",
      properties: {
        path: value(filePath),
        path_hash: value(stableHash(filePath)),
        basename: value(basename(filePath)),
        extension: value(extension(filePath)),
        schema_version: value(TRACE_SCHEMA_VERSION)
      }
    }, {
      operation: "create_edge",
      id: deterministicId("TOUCHED_FILE", [sourceNodeId, fileNodeId]),
      from: sourceNodeId,
      to: fileNodeId,
      edge_type: "TOUCHED_FILE",
      properties: { source: value("claude-code-hooks") }
    });
  });
}
function addCommandOperation(operations, sourceNodeId, command) {
  if (!command)
    return;
  const commandNodeId = deterministicExecutionId("CodeCommand", [stableHash(command)]);
  operations.push({
    operation: "create_node",
    id: commandNodeId,
    label: "CodeCommand",
    mode: "merge",
    properties: {
      ...Object.fromEntries(Object.entries(summarizeCommand(command)).map(([k, v]) => [k, value(v)])),
      schema_version: value(TRACE_SCHEMA_VERSION)
    }
  }, {
    operation: "create_edge",
    id: deterministicId("RAN_COMMAND", [sourceNodeId, commandNodeId]),
    from: sourceNodeId,
    to: commandNodeId,
    edge_type: "RAN_COMMAND",
    properties: { source: value("claude-code-hooks") }
  });
}
function claudeCodeSessionNodeId(trace) {
  const wallet = trace.walletAddress.toLowerCase();
  return deterministicId("ClaudeCodeSession", [wallet, trace.agentId, trace.sessionId, trace.claudeSessionId]);
}
function buildClaudeCodeHookTraceWriteBundle(trace) {
  const wallet = trace.walletAddress.toLowerCase();
  const sessionNodeId = claudeCodeSessionNodeId(trace);
  const turnNodeId = deterministicId("ClaudeCodeTurn", [wallet, trace.agentId, trace.sessionId, trace.turnIndex, trace.claudeSessionId]);
  const walletNodeId = deterministicExecutionId("WalletTenant", [wallet]);
  const agentNodeId = deterministicExecutionId("Agent", [trace.agentId]);
  const model = trace.model ?? "";
  const modelNodeId = model ? deterministicExecutionId("Model", ["anthropic", model]) : null;
  const executionEngineNodeId = deterministicExecutionId("ExecutionEngine", ["claude-code"]);
  const sessionProperties = { agent_id: value(trace.agentId), session_id: value(trace.sessionId), claude_session_id: value(trace.claudeSessionId), wallet_address: value(wallet), source: value("claude-code-hooks"), schema_version: value(TRACE_SCHEMA_VERSION), updated_at: value(trace.completedAt), repository: value(trace.repository), base_repository: value(trace.baseRepository), result_repository: value(trace.resultRepository), work_contract: value(trace.workContract), source_intent_ref: value(trace.sourceIntentRef) };
  if (trace.filesChanged !== void 0)
    sessionProperties.files_changed = value(trace.filesChanged);
  if (trace.parentSessionId !== void 0)
    sessionProperties.parent_session_id = value(trace.parentSessionId);
  if (trace.initialPrompt !== void 0)
    sessionProperties.initial_prompt = value(trace.initialPrompt);
  const operations = [
    { operation: "create_node", id: walletNodeId, label: "WalletTenant", mode: "merge", properties: { wallet_address: value(wallet), schema_version: value(TRACE_SCHEMA_VERSION) } },
    { operation: "create_node", id: agentNodeId, label: "Agent", mode: "merge", properties: { agent_id: value(trace.agentId), schema_version: value(TRACE_SCHEMA_VERSION) } },
    { operation: "create_node", id: sessionNodeId, label: "ClaudeCodeSession", mode: "merge", properties: sessionProperties },
    { operation: "create_node", id: turnNodeId, label: "ClaudeCodeTurn", mode: "merge", properties: { agent_id: value(trace.agentId), session_id: value(trace.sessionId), claude_session_id: value(trace.claudeSessionId), turn_index: value(trace.turnIndex), model: value(model), provider: value("anthropic"), execution_engine: value("claude-code"), cwd: value(trace.cwd ?? ""), started_at: value(trace.startedAt), completed_at: value(trace.completedAt), event_count: value(trace.events.length), schema_version: value(TRACE_SCHEMA_VERSION), repository: value(trace.repository), base_repository: value(trace.baseRepository), result_repository: value(trace.resultRepository), work_contract: value(trace.workContract), source_intent_ref: value(trace.sourceIntentRef) } },
    { operation: "create_edge", id: deterministicExecutionId("OWNS_EXECUTION_SESSION", [walletNodeId, sessionNodeId]), from: walletNodeId, to: sessionNodeId, edge_type: "OWNS_EXECUTION_SESSION", properties: { source: value("claude-code-hooks") } },
    { operation: "create_edge", id: deterministicExecutionId("EXECUTES_AGENT", [sessionNodeId, agentNodeId]), from: sessionNodeId, to: agentNodeId, edge_type: "EXECUTES_AGENT", properties: { agent_id: value(trace.agentId) } },
    { operation: "create_edge", id: deterministicId("HAS_CLAUDE_CODE_TURN", [sessionNodeId, turnNodeId]), from: sessionNodeId, to: turnNodeId, edge_type: "HAS_CLAUDE_CODE_TURN", properties: { turn_index: value(trace.turnIndex) } },
    { operation: "create_node", id: executionEngineNodeId, label: "ExecutionEngine", mode: "merge", properties: { execution_engine: value("claude-code"), schema_version: value(TRACE_SCHEMA_VERSION) } },
    { operation: "create_edge", id: deterministicExecutionId("USES_EXECUTION_ENGINE", [turnNodeId, executionEngineNodeId]), from: turnNodeId, to: executionEngineNodeId, edge_type: "USES_EXECUTION_ENGINE", properties: { execution_engine: value("claude-code") } }
  ];
  const contentArtifacts = [];
  const manifestEntries = [];
  if (trace.initialPrompt !== void 0) {
    const initialPromptArtifact = buildContentArtifactOperations({
      content: trace.initialPrompt,
      mediaType: "text/plain; charset=utf-8",
      observableKind: "initial-human-prompt",
      sourceRef: `claude-code:${trace.claudeSessionId}:initial-prompt`
    });
    contentArtifacts.push(...initialPromptArtifact.artifacts);
    manifestEntries.push({
      sequence: -1,
      eventType: "SessionInitialPrompt",
      receivedAt: trace.startedAt,
      role: "initial-human-prompt",
      artifact: initialPromptArtifact.ref
    });
    operations.push(...initialPromptArtifact.operations, {
      operation: "create_edge",
      id: deterministicId("INCLUDES_ARTIFACT", [sessionNodeId, initialPromptArtifact.ref.artifactId]),
      from: sessionNodeId,
      to: initialPromptArtifact.ref.artifactId,
      edge_type: "INCLUDES_ARTIFACT",
      properties: { role: value("initial-human-prompt"), content_hash: value(initialPromptArtifact.ref.contentHash) }
    });
    sessionProperties.initial_prompt_artifact = value(initialPromptArtifact.ref);
  }
  if (modelNodeId) {
    operations.push({ operation: "create_node", id: modelNodeId, label: "Model", mode: "merge", properties: { provider: value("anthropic"), model: value(model), schema_version: value(TRACE_SCHEMA_VERSION) } }, { operation: "create_edge", id: deterministicExecutionId("USES_MODEL", [turnNodeId, modelNodeId]), from: turnNodeId, to: modelNodeId, edge_type: "USES_MODEL", properties: { provider: value("anthropic"), model: value(model) } });
  }
  addWorkspaceOperations(operations, turnNodeId, trace.cwd);
  trace.events.forEach((event) => {
    const eventId = deterministicId("ClaudeCodeHookEvent", [turnNodeId, event.sequence, event.hookEventName, event.toolUseId ?? ""]);
    const artifactRefs = {};
    const observable = [];
    if (event.prompt !== void 0)
      observable.push({ role: "human-prompt", content: event.prompt, mediaType: "text/plain; charset=utf-8" });
    if (event.lastAssistantMessage !== void 0 && event.lastAssistantMessage !== null) {
      observable.push({ role: "assistant-message", content: event.lastAssistantMessage, mediaType: "text/plain; charset=utf-8" });
    }
    if (event.toolInput !== void 0)
      observable.push({ role: "tool-input", content: stableJson(event.toolInput), mediaType: "application/json" });
    if (event.toolResponse !== void 0)
      observable.push({ role: "tool-response", content: stableJson(event.toolResponse), mediaType: "application/json" });
    if (event.stdout !== void 0)
      observable.push({ role: "tool-stdout", content: event.stdout, mediaType: "text/plain; charset=utf-8" });
    if (event.stderr !== void 0)
      observable.push({ role: "tool-stderr", content: event.stderr, mediaType: "text/plain; charset=utf-8" });
    if (event.decisionQuestion !== void 0)
      observable.push({ role: "decision-question", content: event.decisionQuestion, mediaType: "text/plain; charset=utf-8" });
    if (event.decisionOptions !== void 0)
      observable.push({ role: "decision-options", content: stableJson(event.decisionOptions), mediaType: "application/json" });
    if (event.decisionAnswer !== void 0)
      observable.push({ role: "decision-answer", content: event.decisionAnswer, mediaType: "text/plain; charset=utf-8" });
    if (event.hookPayload !== void 0)
      observable.push({ role: "hook-envelope", content: stableJson(event.hookPayload), mediaType: "application/json" });
    if (event.contextDelivery !== void 0)
      observable.push({ role: "rendered-context", content: event.contextDelivery.renderedContent, mediaType: "text/plain; charset=utf-8" });
    for (const item of observable) {
      const built = buildContentArtifactOperations({
        content: item.content,
        mediaType: item.mediaType,
        observableKind: item.role,
        sourceRef: `claude-code:${trace.claudeSessionId}:${trace.turnIndex}:${event.sequence}:${item.role}`
      });
      artifactRefs[item.role] = built.ref;
      contentArtifacts.push(...built.artifacts);
      operations.push(...built.operations);
      manifestEntries.push({
        sequence: event.sequence,
        eventType: event.hookEventName,
        receivedAt: event.receivedAt,
        role: item.role,
        ...event.toolName ? { toolName: event.toolName } : {},
        ...event.toolUseId ? { toolUseId: event.toolUseId } : {},
        artifact: built.ref
      });
    }
    operations.push({ operation: "create_node", id: eventId, label: "ClaudeCodeHookEvent", mode: "merge", properties: { event_index: value(event.sequence), event_type: value(event.hookEventName), cwd: value(event.cwd ?? trace.cwd ?? ""), tool_name: value(event.toolName ?? ""), tool_use_id: value(event.toolUseId ?? ""), data: value(eventData(event, artifactRefs)), schema_version: value(TRACE_SCHEMA_VERSION) } }, { operation: "create_edge", id: deterministicId("EMITTED_CLAUDE_CODE_HOOK", [turnNodeId, eventId]), from: turnNodeId, to: eventId, edge_type: "EMITTED_CLAUDE_CODE_HOOK", properties: { event_index: value(event.sequence) } });
    for (const [role, artifact] of Object.entries(artifactRefs)) {
      operations.push({ operation: "create_edge", id: deterministicId("INCLUDES_ARTIFACT", [eventId, artifact.artifactId]), from: eventId, to: artifact.artifactId, edge_type: "INCLUDES_ARTIFACT", properties: { role: value(role), content_hash: value(artifact.contentHash) } });
    }
    if (event.contextDelivery && artifactRefs["rendered-context"]) {
      const receipt = buildContextDeliveryReceiptOperations({
        deliveryKey: event.contextDelivery.deliveryKey,
        session: { nodeId: sessionNodeId, label: "ClaudeCodeSession" },
        packId: event.contextDelivery.packId,
        packHash: event.contextDelivery.packHash,
        renderedArtifact: artifactRefs["rendered-context"],
        interface: event.contextDelivery.interface,
        coverageStatus: event.contextDelivery.coverageStatus,
        omissions: event.contextDelivery.omissions,
        deliveredAt: event.contextDelivery.deliveredAt,
        policyHash: event.contextDelivery.policyHash,
        selectedManifestHash: event.contextDelivery.selectedManifestHash,
        corpusWatermark: event.contextDelivery.corpusWatermark
      });
      operations.push(...receipt.operations);
    }
    addWorkspaceOperations(operations, eventId, event.cwd ?? trace.cwd);
    const toolNodeId = event.toolName ? deterministicId("ClaudeCodeToolUse", [turnNodeId, event.toolUseId ?? event.sequence, event.toolName]) : null;
    if (toolNodeId) {
      operations.push({ operation: "create_node", id: toolNodeId, label: "ClaudeCodeToolUse", mode: "merge", properties: { tool_name: value(event.toolName), tool_use_id: value(event.toolUseId ?? ""), hook_event_name: value(event.hookEventName), event_index: value(event.sequence), tool_input: value(event.toolInput === void 0 ? void 0 : summarizePayload(event.toolInput)), tool_response: value(event.toolResponse === void 0 ? void 0 : summarizePayload(event.toolResponse)), command: value(extractCommand(event.toolInput) ? summarizeCommand(extractCommand(event.toolInput)) : void 0), permission_decision: value(event.permissionDecision ?? ""), schema_version: value(TRACE_SCHEMA_VERSION) } }, { operation: "create_edge", id: deterministicId("INVOKED_CLAUDE_CODE_TOOL", [turnNodeId, toolNodeId]), from: turnNodeId, to: toolNodeId, edge_type: "INVOKED_CLAUDE_CODE_TOOL", properties: { tool_name: value(event.toolName) } });
    }
    const projectionSourceId = toolNodeId ?? eventId;
    addCodeFileOperations(operations, projectionSourceId, [...collectFilePaths(event.toolInput), ...collectFilePaths(event.toolResponse)]);
    addCommandOperation(operations, projectionSourceId, extractCommand(event.toolInput));
    const decisionKind = event.decisionKind ?? (event.permissionDecision !== void 0 ? "tool_permission" : event.toolName && /askuser|ask_user/i.test(event.toolName) ? "ask_user" : null);
    if (decisionKind) {
      let questionArtifact = artifactRefs["decision-question"] ?? artifactRefs["tool-input"] ?? artifactRefs["human-prompt"];
      if (!questionArtifact) {
        const built = buildContentArtifactOperations({
          content: stableJson({ toolName: event.toolName, reason: event.reason }),
          mediaType: "application/json",
          observableKind: "decision-question",
          sourceRef: `claude-code:${trace.claudeSessionId}:${trace.turnIndex}:${event.sequence}:decision-question`
        });
        questionArtifact = built.ref;
        contentArtifacts.push(...built.artifacts);
        operations.push(...built.operations);
      }
      const observation = buildDecisionObservationOperations({
        observationKey: `${decisionKind}:${event.toolUseId ?? event.sequence}`,
        session: { nodeId: sessionNodeId, label: "ClaudeCodeSession" },
        kind: decisionKind,
        interface: "claude-code",
        questionArtifact,
        optionsArtifact: artifactRefs["decision-options"] ?? artifactRefs["tool-input"],
        rationaleArtifact: artifactRefs["decision-answer"],
        optionsPresented: event.decisionOptions ?? [],
        selectedOption: event.decisionAnswer ?? event.permissionDecision ?? (event.toolResponse === void 0 ? void 0 : stableJson(event.toolResponse)),
        actor: "human",
        policyRef: event.decisionPolicyRef ?? event.permissionDecisionReason,
        observedAt: new Date(event.receivedAt).toISOString()
      });
      operations.push(...observation.operations);
    }
  });
  const manifest = buildSessionArtifactManifestOperations({
    engine: "claude-code",
    runtime: { agentId: trace.agentId, ...trace.model ? { model: trace.model } : {}, ...trace.cwd ? { cwd: trace.cwd } : {} },
    session: { nodeId: sessionNodeId, label: "ClaudeCodeSession", externalSessionId: trace.claudeSessionId },
    turn: {
      nodeId: turnNodeId,
      label: "ClaudeCodeTurn",
      index: trace.turnIndex,
      startedAt: trace.startedAt,
      completedAt: trace.completedAt
    },
    repository: trace.repository,
    entries: manifestEntries
  });
  operations.push(...manifest.operations);
  contentArtifacts.push(...manifest.contentArtifacts);
  return { operations, contentArtifacts };
}

// node_modules/rickydata/dist/kfdb/codex-hook-trace.js
import { createHash as createHash5, randomUUID as randomUUID3 } from "node:crypto";
var KG_NAMESPACE3 = uuidV54("rickydata-codex-hook-knowledge-graph-v1", "6ba7b811-9dad-11d1-80b4-00c04fd430c8");
var EXECUTION_KG_NAMESPACE3 = uuidV54("rickydata-execution-knowledge-graph-v1", "6ba7b811-9dad-11d1-80b4-00c04fd430c8");
function uuidV54(name, namespace) {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  if (ns.length !== 16)
    throw new Error("Invalid UUID namespace");
  const hash = createHash5("sha1").update(Buffer.concat([ns, Buffer.from(name)])).digest();
  hash[6] = hash[6] & 15 | 80;
  hash[8] = hash[8] & 63 | 128;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// node_modules/rickydata/dist/kfdb/hermes-hook-trace.js
import { createHash as createHash6, randomUUID as randomUUID4 } from "node:crypto";
var KG_NAMESPACE4 = uuidV55("rickydata-hermes-hook-knowledge-graph-v1", "6ba7b811-9dad-11d1-80b4-00c04fd430c8");
var EXECUTION_KG_NAMESPACE4 = uuidV55("rickydata-execution-knowledge-graph-v1", "6ba7b811-9dad-11d1-80b4-00c04fd430c8");
function uuidV55(name, namespace) {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  if (ns.length !== 16)
    throw new Error("Invalid UUID namespace");
  const hash = createHash6("sha1").update(Buffer.concat([ns, Buffer.from(name)])).digest();
  hash[6] = hash[6] & 15 | 80;
  hash[8] = hash[8] & 63 | 128;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// node_modules/rickydata/dist/kfdb/session-link.js
import { createHash as createHash7 } from "node:crypto";
var EXECUTION_KG_NAMESPACE5 = uuidV56("rickydata-execution-knowledge-graph-v1", "6ba7b811-9dad-11d1-80b4-00c04fd430c8");
var TRACE_SCHEMA_VERSION2 = 3;
var HARNESS_SESSION_KEY_LABEL = "HarnessSessionKey";
var SAME_SESSION_EDGE_TYPE = "SAME_SESSION";
function uuidV56(name, namespace) {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  if (ns.length !== 16)
    throw new Error("Invalid UUID namespace");
  const hash = createHash7("sha1").update(Buffer.concat([ns, Buffer.from(name)])).digest();
  hash[6] = hash[6] & 15 | 80;
  hash[8] = hash[8] & 63 | 128;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function deterministicExecutionId2(kind, parts) {
  return uuidV56(`${kind}:${parts.map((p) => String(p)).join(":")}`, EXECUTION_KG_NAMESPACE5);
}
function value2(input) {
  if (input === null || input === void 0)
    return { Null: null };
  if (typeof input === "boolean")
    return { Boolean: input };
  if (typeof input === "number")
    return Number.isInteger(input) ? { Integer: input } : { Float: input };
  return { String: String(input) };
}
function sessionLinkNodeId({ walletAddress, claudeSessionId }) {
  const wallet = walletAddress.toLowerCase();
  return deterministicExecutionId2(HARNESS_SESSION_KEY_LABEL, [wallet, claudeSessionId]);
}
function buildSessionLinkOperations({ walletAddress, claudeSessionId, fromNodeId, fromLabel }) {
  const wallet = walletAddress.toLowerCase();
  const harnessNodeId = sessionLinkNodeId({ walletAddress, claudeSessionId });
  return [
    {
      operation: "create_node",
      id: harnessNodeId,
      label: HARNESS_SESSION_KEY_LABEL,
      mode: "merge",
      properties: {
        wallet_address: value2(wallet),
        claude_session_id: value2(claudeSessionId),
        schema_version: value2(TRACE_SCHEMA_VERSION2)
      }
    },
    {
      operation: "create_edge",
      id: deterministicExecutionId2(SAME_SESSION_EDGE_TYPE, [fromNodeId, harnessNodeId]),
      from: fromNodeId,
      to: harnessNodeId,
      edge_type: SAME_SESSION_EDGE_TYPE,
      properties: { from_label: value2(fromLabel) }
    }
  ];
}

// node_modules/rickydata/dist/kfdb/memory-v1.js
var OPEN_QUESTION_LABEL = GraphEntityKind.OpenQuestion;

// node_modules/rickydata/dist/kfdb/wiki-v1.js
var WIKI_V1_NODE_LABELS = ["WikiPage", "WikiClaim", "WikiRevision"];
var AKC_PRIVATE_LABELS = [
  ...WIKI_V1_NODE_LABELS,
  "RickydataContextPack",
  "RickydataReflectSnapshot",
  "RickydataCanvasGateReport"
];

// src/lib/erc8128.ts
import crypto5 from "node:crypto";
init_sha3();
var ERC8128_LABEL2 = "eth";
var ERC8128_CHAIN_ID2 = 8453;
var VALIDITY_SEC = 90;
var CREATED_BACKDATE_SEC = 5;
function buildSignatureBase(input) {
  const params = `(@method @path @authority;created=${input.created};expires=${input.expires};nonce="${input.nonce}";keyid="${input.keyid}")`;
  return `"@method": ${input.method.toUpperCase()}
"@path": ${input.path}
"@authority": ${input.authority}
"@signature-params": ${params}`;
}
function signEip191(message, privateKey) {
  const hex = privateKey.startsWith("0x") ? privateKey.slice(2) : privateKey;
  const priv = Uint8Array.from(Buffer.from(hex, "hex"));
  const prefix = new TextEncoder().encode(`Ethereum Signed Message:
${message.length}`);
  const prefixed = new Uint8Array(prefix.length + message.length);
  prefixed.set(prefix, 0);
  prefixed.set(message, prefix.length);
  const digest = keccak_256(prefixed);
  const sig = secp256k1.sign(digest, priv);
  const out = new Uint8Array(65);
  out.set(sig.toCompactRawBytes(), 0);
  out[64] = sig.recovery + 27;
  return out;
}
function signErc8128Request2(input) {
  const parsed = new URL(input.url);
  const authority = parsed.host;
  const path9 = parsed.pathname;
  const created = input.createdSec ?? Math.floor(Date.now() / 1e3) - CREATED_BACKDATE_SEC;
  const expires = created + VALIDITY_SEC;
  const nonce = input.nonce ?? crypto5.randomBytes(16).toString("hex");
  const chainId = input.chainId ?? ERC8128_CHAIN_ID2;
  const keyid = `erc8128:${chainId}:${addressFromPrivateKey(input.privateKey)}`;
  const base = buildSignatureBase({ method: input.method, path: path9, authority, created, expires, nonce, keyid });
  const sigBytes = signEip191(new TextEncoder().encode(base), input.privateKey);
  const sigB64 = Buffer.from(sigBytes).toString("base64");
  return {
    "Signature-Input": `${ERC8128_LABEL2}=(@method @path @authority;created=${created};expires=${expires};nonce="${nonce}";keyid="${keyid}")`,
    Signature: `${ERC8128_LABEL2}=:${sigB64}:`
  };
}

// src/lib/kfdb-auth.ts
function kfdbAuthFromConfig(config, deriveHeaders) {
  return {
    apiKey: config.api_key || void 0,
    privateKey: config.private_key || void 0,
    deriveHeaders
  };
}
function kfdbAuthHeaders(auth, method, url) {
  const headers = auth.deriveHeaders ? { ...auth.deriveHeaders } : {};
  if (auth.apiKey) {
    headers.Authorization = `Bearer ${auth.apiKey}`;
  } else if (auth.privateKey) {
    Object.assign(headers, signErc8128Request2({ method, url, privateKey: auth.privateKey }));
  }
  return headers;
}

// src/lib/graph.ts
var BATCH_SIZE = 900;
var GRAPH_WRITE_TIMEOUT_MS = 6e4;
function buildGraphWriteBundle(walletAddress, traces) {
  const operations = [];
  const contentArtifacts = [];
  for (const trace of traces) {
    const bundle = buildClaudeCodeHookTraceWriteBundle(trace);
    operations.push(...bundle.operations);
    contentArtifacts.push(...bundle.contentArtifacts);
    const fromNodeId = claudeCodeSessionNodeId(trace);
    operations.push(
      ...buildSessionLinkOperations({
        walletAddress,
        claudeSessionId: trace.claudeSessionId,
        fromNodeId,
        fromLabel: "ClaudeCodeSession"
      })
    );
  }
  return { operations, contentArtifacts };
}
function batchOperations(operations) {
  const batches = [];
  for (let offset = 0; offset < operations.length; offset += BATCH_SIZE) {
    batches.push(operations.slice(offset, offset + BATCH_SIZE));
  }
  return batches;
}

// src/lib/queue.ts
var MAX_ATTEMPTS_TRANSIENT = 12;
var MAX_ATTEMPTS_PERMANENT = 3;
var BACKOFF_BASE_MS = 3e4;
var BACKOFF_CAP_MS = 4 * 60 * 60 * 1e3;
var SPLIT_MIN_OPS = 60;
var DEFAULT_DRAIN_BUDGET_MS = 4 * 6e4;
var DRAIN_LOCK_STALE_MS = 15 * 6e4;
var HASH_RE = /-c([0-9a-f]{16})\.json$/;
function hash16(input) {
  return createHash8("sha256").update(input).digest("hex").slice(0, 16);
}
function contentHashOf(request) {
  return hash16(`${request.url}
${JSON.stringify(request.body)}`);
}
function enqueue(request, dirs = {}) {
  const dir = dirs.dir ?? QUEUE_DIR;
  try {
    fs7.mkdirSync(dir, { recursive: true });
    const contentHash = contentHashOf(request);
    const keyHash = request.dedupeKey ? hash16(request.dedupeKey) : void 0;
    let existing = [];
    try {
      existing = fs7.readdirSync(dir).filter((f) => f.endsWith(".json"));
    } catch {
    }
    if (existing.some((f) => f.includes(`-c${contentHash}.json`))) {
      log("debug", "enqueue skipped: identical entry already queued", { contentHash });
      return;
    }
    if (keyHash) {
      const superseded = existing.filter((f) => f.includes(`-k${keyHash}-`));
      for (const f of superseded) {
        try {
          fs7.rmSync(path6.join(dir, f), { force: true });
        } catch {
        }
      }
      if (superseded.length > 0) {
        log("debug", "enqueue superseded older entries", { dedupeKey: request.dedupeKey, replaced: superseded.length });
      }
    }
    const rand = Math.random().toString(36).slice(2, 10);
    const keySegment = keyHash ? `-k${keyHash}` : "";
    const name = `${Date.now()}-${rand}${keySegment}-c${contentHash}.json`;
    const entry = { ...request, queuedAt: (/* @__PURE__ */ new Date()).toISOString() };
    fs7.writeFileSync(path6.join(dir, name), JSON.stringify(entry), { mode: 384 });
  } catch (err) {
    log("warn", "enqueue failed", { error: err.message });
  }
}
function classifyStatus(status) {
  const flappy4xx = /* @__PURE__ */ new Set([401, 403, 404, 405, 408, 429]);
  if (status >= 400 && status < 500 && !flappy4xx.has(status)) return "permanent";
  return "transient";
}
function backoffMs(attempts) {
  const base = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_CAP_MS);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}
function recordFailure(full, entry, error, kind, deadDir) {
  const attempts = (entry.attempts ?? 0) + 1;
  const maxAttempts = kind === "permanent" ? MAX_ATTEMPTS_PERMANENT : MAX_ATTEMPTS_TRANSIENT;
  if (attempts >= maxAttempts) {
    try {
      fs7.mkdirSync(deadDir, { recursive: true });
      fs7.renameSync(full, path6.join(deadDir, path6.basename(full)));
      log("warn", "queue entry dead-lettered", { file: path6.basename(full), attempts, error: error.slice(0, 200) });
      return "deadLettered";
    } catch {
    }
  }
  try {
    const updated = {
      ...entry,
      attempts,
      nextAttemptAt: new Date(Date.now() + backoffMs(attempts)).toISOString(),
      lastError: error.slice(0, 300)
    };
    fs7.writeFileSync(full, JSON.stringify(updated), { mode: 384 });
  } catch {
  }
  return "retained";
}
function splitEntry(dir, full, entry, operations) {
  try {
    const mid = Math.ceil(operations.length / 2);
    const halves = [operations.slice(0, mid), operations.slice(mid)];
    const tsPrefix = path6.basename(full).split("-")[0] || `${Date.now()}`;
    const rand = Math.random().toString(36).slice(2, 10);
    halves.forEach((ops, i) => {
      const body = { ...entry.body, operations: ops };
      const request = {
        url: entry.url,
        method: entry.method,
        body,
        requiresBearer: entry.requiresBearer,
        requiresDerive: entry.requiresDerive,
        queuedAt: entry.queuedAt,
        // Halves keep the original's retry state but drop its dedupeKey: a
        // later full-size enqueue for that key must not delete partial halves.
        attempts: entry.attempts,
        nextAttemptAt: new Date(Date.now() + BACKOFF_BASE_MS).toISOString(),
        lastError: `split after timeout at ${operations.length} ops`
      };
      const name = `${tsPrefix}-${rand}${i}-c${contentHashOf(request)}.json`;
      fs7.writeFileSync(path6.join(dir, name), JSON.stringify(request), { mode: 384 });
    });
    fs7.rmSync(full, { force: true });
    return true;
  } catch (err) {
    log("warn", "queue split failed", { error: err.message });
    return false;
  }
}
function countQueue(dir) {
  try {
    return fs7.readdirSync(dir).filter((f) => f.endsWith(".json")).length;
  } catch {
    return 0;
  }
}
async function drainQueue(auth, limit = 500, options = {}) {
  const dir = options.dir ?? QUEUE_DIR;
  const deadDir = options.deadDir ?? QUEUE_DEAD_DIR;
  const maxMs = options.maxMs ?? DEFAULT_DRAIN_BUDGET_MS;
  const result = { sent: 0, failed: 0, remaining: 0, deferred: 0, deduped: 0, deadLettered: 0, split: 0 };
  let files;
  try {
    files = fs7.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return result;
  }
  if (files.length === 0) return result;
  const lockPath2 = path6.join(dir, ".drain.lock");
  try {
    const stat = fs7.statSync(lockPath2);
    if (Date.now() - stat.mtimeMs < DRAIN_LOCK_STALE_MS) {
      log("debug", "drain skipped: another drain holds the lock");
      result.remaining = files.length;
      return result;
    }
  } catch {
  }
  try {
    fs7.writeFileSync(lockPath2, JSON.stringify({ pid: process.pid, startedAt: (/* @__PURE__ */ new Date()).toISOString() }), { mode: 384 });
  } catch {
  }
  const startedAt = Date.now();
  const sentHashes = /* @__PURE__ */ new Set();
  const failedHashes = /* @__PURE__ */ new Set();
  try {
    files.sort();
    let attempted = 0;
    for (const file of files) {
      if (attempted >= limit) break;
      if (Date.now() - startedAt > maxMs) {
        log("info", "drain budget exhausted", { attempted, budgetMs: maxMs });
        break;
      }
      const full = path6.join(dir, file);
      let entry;
      try {
        entry = JSON.parse(fs7.readFileSync(full, "utf8"));
      } catch {
        try {
          fs7.rmSync(full, { force: true });
        } catch {
        }
        continue;
      }
      if (entry.nextAttemptAt && Date.parse(entry.nextAttemptAt) > Date.now()) {
        result.deferred += 1;
        continue;
      }
      const contentHash = HASH_RE.exec(file)?.[1] ?? contentHashOf(entry);
      if (sentHashes.has(contentHash)) {
        try {
          fs7.rmSync(full, { force: true });
        } catch {
        }
        result.deduped += 1;
        continue;
      }
      if (failedHashes.has(contentHash)) {
        result.deferred += 1;
        continue;
      }
      const headers = {};
      if (entry.requiresBearer && auth.apiKey) {
        headers.Authorization = `Bearer ${auth.apiKey}`;
      } else if (entry.requiresBearer && auth.privateKey) {
        Object.assign(headers, signErc8128Request2({ method: entry.method ?? "POST", url: entry.url, privateKey: auth.privateKey }));
      }
      if (entry.requiresDerive && auth.deriveHeaders) Object.assign(headers, auth.deriveHeaders);
      if (entry.requiresBearer && !auth.apiKey && !auth.privateKey || entry.requiresDerive && !auth.deriveHeaders) {
        result.failed += 1;
        continue;
      }
      attempted += 1;
      try {
        const response = await postJson(entry.url, entry.body, headers, GRAPH_WRITE_TIMEOUT_MS, entry.method ?? "POST");
        if (response.ok) {
          fs7.rmSync(full, { force: true });
          result.sent += 1;
          sentHashes.add(contentHash);
        } else if (response.status === 429) {
          result.failed += 1;
          log("info", "drain stopped: server rate-limited (429)", { attempted });
          break;
        } else {
          result.failed += 1;
          failedHashes.add(contentHash);
          const outcome = recordFailure(
            full,
            entry,
            `HTTP ${response.status}: ${response.text.slice(0, 200)}`,
            classifyStatus(response.status),
            deadDir
          );
          if (outcome === "deadLettered") result.deadLettered += 1;
        }
      } catch (err) {
        const error = err;
        result.failed += 1;
        failedHashes.add(contentHash);
        const isTimeout = error.name === "AbortError" || error.name === "TimeoutError";
        const body = entry.body;
        const operations = body && Array.isArray(body.operations) ? body.operations : void 0;
        if (isTimeout && operations && operations.length >= SPLIT_MIN_OPS) {
          if (splitEntry(dir, full, entry, operations)) {
            result.split += 1;
            log("info", "queue entry split after timeout", { file, ops: operations.length });
            continue;
          }
        }
        const outcome = recordFailure(full, entry, error.message || String(error), "transient", deadDir);
        if (outcome === "deadLettered") result.deadLettered += 1;
      }
    }
  } finally {
    try {
      fs7.rmSync(lockPath2, { force: true });
    } catch {
    }
  }
  result.remaining = countQueue(dir);
  return result;
}

// src/lib/trace.ts
var RD_AGENT_ID = process.env.RD_KG_AGENT_ID || "claude-code";
function groupTurns(events) {
  const groups = [];
  let current = null;
  for (const event of events) {
    if (current === null || event.hookEventName === "UserPromptSubmit") {
      current = [];
      groups.push(current);
    }
    current.push(event);
  }
  return groups.filter((g) => g.length > 0);
}
function firstDefined(values) {
  for (const v of values) if (v !== void 0 && v !== null && v !== "") return v;
  return void 0;
}
function firstUserPromptText(events) {
  for (const e of events) {
    if (e.hookEventName === "UserPromptSubmit" && typeof e.prompt === "string") {
      const text = e.prompt.trim();
      if (text) return text;
    }
  }
  return void 0;
}
function buildTraces(input) {
  const { walletAddress, claudeSessionId, events, summary } = input;
  const groups = groupTurns(events);
  const sessionModel = firstDefined([summary?.model, ...events.map((e) => e.model)]);
  const sessionCwd = firstDefined([summary?.cwd, ...events.map((e) => e.cwd)]);
  const sessionInitialPrompt = firstDefined([summary?.initialPrompt, firstUserPromptText(events)]);
  return groups.map((group, index) => {
    const turnModel = firstDefined([...group.map((e) => e.model), sessionModel]);
    const turnCwd = firstDefined([...group.map((e) => e.cwd), sessionCwd]);
    const trace = {
      walletAddress,
      agentId: RD_AGENT_ID,
      sessionId: claudeSessionId,
      turnIndex: index + 1,
      claudeSessionId,
      model: turnModel,
      cwd: turnCwd,
      startedAt: group[0].receivedAt,
      completedAt: group[group.length - 1].receivedAt,
      events: group.map((event) => ({
        ...event,
        hookPayload: sdkHookPayload(event.hookPayload, event.workProvenance)
      }))
    };
    if (sessionInitialPrompt !== void 0) trace.initialPrompt = sessionInitialPrompt;
    if (summary?.filesChanged !== void 0) trace.filesChanged = summary.filesChanged;
    if (summary?.parentSessionId !== void 0) trace.parentSessionId = summary.parentSessionId;
    const repository = group.find((event) => event.repository)?.repository;
    if (repository?.fullName !== void 0) trace.repository = repository;
    const baseRepository = group.find((event) => event.repository?.fullName)?.repository;
    const resultRepository = [...group].reverse().find((event) => event.repository?.fullName)?.repository;
    if (baseRepository?.fullName) trace.baseRepository = baseRepository;
    if (resultRepository?.fullName) trace.resultRepository = resultRepository;
    const workContract = group.find((event) => event.workContract)?.workContract;
    const sourceIntentRef = firstDefined(group.map((event) => event.sourceIntentRef));
    if (workContract) trace.workContract = workContract;
    if (sourceIntentRef) trace.sourceIntentRef = sourceIntentRef;
    return trace;
  });
}

// src/lib/plan.ts
import { createHash as createHash9 } from "node:crypto";
var TRACE_SCHEMA_VERSION3 = 3;
function uuidV57(name, namespace) {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash9("sha1").update(Buffer.concat([ns, Buffer.from(name)])).digest();
  hash[6] = hash[6] & 15 | 80;
  hash[8] = hash[8] & 63 | 128;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
var UUID_SEED = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
var KG_NAMESPACE5 = uuidV57("rickydata-claude-code-hook-knowledge-graph-v1", UUID_SEED);
var EXECUTION_KG_NAMESPACE6 = uuidV57("rickydata-execution-knowledge-graph-v1", UUID_SEED);
function deterministicId2(kind, parts) {
  return uuidV57(`${kind}:${parts.map((p) => String(p)).join(":")}`, KG_NAMESPACE5);
}
function deterministicExecutionId3(kind, parts) {
  return uuidV57(`${kind}:${parts.map((p) => String(p)).join(":")}`, EXECUTION_KG_NAMESPACE6);
}
function stableHash2(input) {
  return createHash9("sha256").update(input).digest("hex");
}
function basename2(input) {
  const normalized = input.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() ?? normalized;
}
function str2(v) {
  return { String: v };
}
function int(v) {
  return { Integer: v };
}
function planNodeId(plan) {
  return plan.planFilePath ? deterministicExecutionId3("Plan", [plan.planFilePath]) : deterministicExecutionId3("Plan", ["content", stableHash2(plan.content ?? "")]);
}
function buildPlanOperations(plans, sessionNodeId) {
  const operations = [];
  for (const plan of plans) {
    if (!plan.planFilePath && !plan.content) continue;
    const nodeId = planNodeId(plan);
    const properties = {
      source: str2("claude-code-plan-mode"),
      schema_version: int(TRACE_SCHEMA_VERSION3)
    };
    if (plan.planFilePath) {
      properties.path = str2(plan.planFilePath);
      properties.path_hash = str2(stableHash2(plan.planFilePath));
      properties.slug = str2(basename2(plan.planFilePath).replace(/\.md$/, ""));
    }
    if (plan.content) {
      properties.content = str2(plan.content);
      properties.content_hash = str2(stableHash2(plan.content));
      properties.content_length = int(plan.content.length);
    }
    if (plan.updatedAt !== void 0) properties.updated_at = int(plan.updatedAt);
    operations.push({ operation: "create_node", id: nodeId, label: "Plan", mode: "merge", properties });
    if (sessionNodeId) {
      operations.push({
        operation: "create_edge",
        id: deterministicId2("HAS_PLAN", [sessionNodeId, nodeId]),
        from: sessionNodeId,
        to: nodeId,
        edge_type: "HAS_PLAN",
        properties: { source: str2("claude-code-plan-mode") }
      });
    }
    if (plan.planFilePath) {
      const fileNodeId = deterministicExecutionId3("CodeFile", [plan.planFilePath]);
      operations.push(
        {
          operation: "create_node",
          id: fileNodeId,
          label: "CodeFile",
          mode: "merge",
          properties: {
            path: str2(plan.planFilePath),
            path_hash: str2(stableHash2(plan.planFilePath)),
            basename: str2(basename2(plan.planFilePath)),
            extension: str2("md"),
            schema_version: int(TRACE_SCHEMA_VERSION3)
          }
        },
        {
          operation: "create_edge",
          id: deterministicId2("PLAN_FILE", [nodeId, fileNodeId]),
          from: nodeId,
          to: fileNodeId,
          edge_type: "PLAN_FILE",
          properties: { source: str2("claude-code-plan-mode") }
        }
      );
    }
  }
  return operations;
}

// src/lib/artifacts.ts
async function writeContentArtifacts(config, auth, artifacts) {
  const unique = [...new Map(artifacts.map((artifact) => [artifact.key, artifact])).values()];
  const url = `${config.api_url.replace(/\/$/, "")}/api/v1/kv`;
  const result = { attempted: unique.length, persisted: 0, queued: 0, ok: true };
  for (const artifact of unique) {
    const body = { key: artifact.key, value: artifact.value, if_absent: true };
    const queuedRequest = {
      url,
      method: "PUT",
      body,
      requiresBearer: true,
      requiresDerive: true,
      dedupeKey: `content-artifact:${artifact.key}`
    };
    if (!auth.deriveHeaders) {
      enqueue(queuedRequest);
      result.queued += 1;
      result.ok = false;
      continue;
    }
    try {
      const response = await putJson(url, body, kfdbAuthHeaders(auth, "PUT", url), 6e4);
      if (response.ok || response.status === 409) {
        result.persisted += 1;
      } else {
        enqueue(queuedRequest);
        result.queued += 1;
        result.ok = false;
        log("warn", "content artifact write failed; queued", { key: artifact.key, status: response.status });
      }
    } catch (error) {
      enqueue(queuedRequest);
      result.queued += 1;
      result.ok = false;
      log("warn", "content artifact write error; queued", { key: artifact.key, error: error.message });
    }
  }
  return result;
}

// src/lib/spool.ts
import path7 from "node:path";

// src/lib/spool-record.ts
var GATEWAY_SPOOL_MAX_BYTES = 2 * 1024 * 1024;
function contentArtifactRecord(identity, artifact) {
  return { spoolVersion: 3, recordType: "content_artifact", ...identity, artifact };
}
function graphBatchRecord(identity, graphOperations) {
  return { spoolVersion: 3, recordType: "graph_batch", ...identity, graphOperations };
}
function serializeBoundedSpoolRecord(record2) {
  const serialized = JSON.stringify(record2);
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > GATEWAY_SPOOL_MAX_BYTES) {
    throw new Error(`spool record is ${bytes} bytes; gateway maximum is ${GATEWAY_SPOOL_MAX_BYTES}`);
  }
  return serialized;
}
function splitGraphBatchByBytes(identity, operations) {
  if (operations.length === 0) return [[]];
  const batches = [];
  let current = [];
  for (const operation of operations) {
    const candidate = [...current, operation];
    const bytes = Buffer.byteLength(JSON.stringify(graphBatchRecord(identity, candidate)), "utf8");
    if (bytes <= GATEWAY_SPOOL_MAX_BYTES) {
      current = candidate;
      continue;
    }
    if (current.length === 0) {
      throw new Error("one graph operation exceeds the gateway spool record limit");
    }
    batches.push(current);
    current = [operation];
    serializeBoundedSpoolRecord(graphBatchRecord(identity, current));
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
function artifactSpoolFileName(identity, artifact, artifactIndex) {
  const safe = identity.traceSessionId.replace(/[^A-Za-z0-9_.-]/g, "_") || "unknown";
  const kind = identity.traceKind === "claude_code" ? "claude" : "codex";
  const hash = artifact.key.replace("content-artifact:sha256:", "").slice(0, 16);
  return `artifact-${kind}-${safe}-${identity.turnIndex}-a${String(artifactIndex).padStart(4, "0")}-${hash}.json`;
}

// src/lib/spool.ts
function spoolFileName(claudeSessionId, seq, batchIndex = 0) {
  const safe = String(claudeSessionId || "unknown").replace(/[^A-Za-z0-9_.-]/g, "_");
  const suffix = batchIndex > 0 ? `-b${batchIndex}` : "";
  return `trace-${safe}-${seq}${suffix}.json`;
}
function writeSpool(spoolDir, traces) {
  const written = [];
  for (const trace of traces) {
    const bundle = buildGraphWriteBundle(trace.walletAddress, [trace]);
    const identity = {
      traceKind: "claude_code",
      walletAddress: trace.walletAddress,
      traceSessionId: trace.claudeSessionId,
      turnIndex: trace.turnIndex
    };
    const artifacts = [...new Map(bundle.contentArtifacts.map((artifact) => [artifact.key, artifact])).values()];
    artifacts.forEach((artifact, artifactIndex) => {
      const body = contentArtifactRecord(identity, artifact);
      const filePath = path7.join(spoolDir, artifactSpoolFileName(identity, artifact, artifactIndex));
      writeFileAtomic(filePath, serializeBoundedSpoolRecord(body));
      written.push(filePath);
    });
    const countBatches = batchOperations(bundle.operations);
    if (countBatches.length === 0) countBatches.push([]);
    const batches = countBatches.flatMap((batch) => splitGraphBatchByBytes(identity, batch));
    batches.forEach((batch, batchIndex) => {
      const body = graphBatchRecord(identity, batch);
      const filePath = path7.join(spoolDir, spoolFileName(trace.claudeSessionId, trace.turnIndex, batchIndex));
      writeFileAtomic(filePath, serializeBoundedSpoolRecord(body));
      written.push(filePath);
    });
  }
  return written;
}

// src/lib/legacy-stream.ts
import path8 from "node:path";
function workspaceName(cwd) {
  if (!cwd) return "unknown";
  return path8.basename(cwd) || cwd;
}
function isoTime(ms) {
  return new Date(ms || Date.now()).toISOString();
}
function summarizePayload2(payload) {
  if (payload === void 0 || payload === null) return null;
  if (typeof payload === "string") return { text: payload.slice(0, 2e3), length: payload.length };
  const encoded = JSON.stringify(payload) ?? "";
  return { preview: encoded.slice(0, 2e3), length: encoded.length, sha256: sha256Hex(encoded) };
}
function extractCommand2(input) {
  if (typeof input === "string") return input;
  if (!input || typeof input !== "object") return null;
  const rec = input;
  for (const key of ["command", "cmd", "script"]) {
    if (typeof rec[key] === "string" && rec[key]) return rec[key];
  }
  return null;
}
var GIT_PATTERNS = [
  /^git\s+commit/,
  /^git\s+push/,
  /^git\s+pull/,
  /^git\s+merge/,
  /^git\s+rebase/,
  /^git\s+checkout/,
  /^git\s+branch/,
  /^git\s+tag/,
  /^git\s+stash/,
  /^git\s+reset/,
  /^git\s+revert/,
  /^git\s+cherry-pick/
];
function isGitOperation(command) {
  const trimmed = command.trim();
  return GIT_PATTERNS.some((p) => p.test(trimmed));
}
function parseGitOperation(command) {
  const m = command.match(/^git\s+(\w+)/);
  return m ? m[1] : "unknown";
}
function extractCommitMessage(command) {
  const m = command.match(/-m\s+["']([^"']+)["']/);
  return m ? m[1] : null;
}
function extractCommitHash(output) {
  const m = output.match(/\[[\w./-]+\s+([a-f0-9]{7,40})\]/);
  if (m) return m[1];
  const full = output.match(/([a-f0-9]{40})/);
  return full ? full[1] : null;
}
function outputText(response) {
  if (typeof response === "string") return response;
  if (response && typeof response === "object") {
    const r = response;
    return `${String(r.stdout ?? "")}
${String(r.stderr ?? "")}`.trim();
  }
  return "";
}
function successfulToolEvent(event) {
  const response = event.toolResponse;
  if (response && typeof response === "object") {
    const r = response;
    if (typeof r.success === "boolean") return r.success;
    if (typeof r.exit_code === "number") return r.exit_code === 0;
    if (typeof r.error === "string" && r.error) return false;
  }
  return void 0;
}
async function post(cfg, pathName, body, queueOnFailure) {
  const url = `${cfg.apiUrl.replace(/\/$/, "")}/api/v1/plugin/${pathName}`;
  const headers = kfdbAuthHeaders(cfg.auth, "POST", url);
  try {
    const result = await postJson(url, body, headers, 15e3);
    if (result.ok) return true;
    if (queueOnFailure) enqueue({ url, body, requiresBearer: true, requiresDerive: true });
    return false;
  } catch {
    if (queueOnFailure) enqueue({ url, body, requiresBearer: true, requiresDerive: true });
    return false;
  }
}
function countMessages(events) {
  return events.filter((e) => e.prompt || e.lastAssistantMessage).length;
}
function countToolCalls(events) {
  return events.filter((e) => e.toolName && e.hookEventName === "PostToolUse").length;
}
function outcomeSummary(events, summary) {
  for (let i = events.length - 1; i >= 0; i--) {
    const text = events[i].lastAssistantMessage;
    if (typeof text === "string" && text.trim()) return text.trim().slice(0, 1e3);
  }
  if (summary?.initialPrompt) return summary.initialPrompt.slice(0, 1e3);
  return "Claude Code session";
}
async function writeLegacyStream(cfg, claudeSessionId, events, startAfterSequence, summary, transcriptPath, prior) {
  const first = events[0];
  const last = events[events.length - 1];
  const cwd = summary?.cwd || first.cwd || last.cwd || "";
  const workspace = workspaceName(cwd);
  const metadata = {
    source: "claude-code-hooks",
    provider: "claude-code",
    event_count: events.length,
    hook_event_types: [...new Set(events.map((e) => e.hookEventName))]
  };
  if (summary?.parentSessionId) metadata.parent_session_id = summary.parentSessionId;
  await post(cfg, "ensure-session", {
    session_id: claudeSessionId,
    workspace_name: workspace,
    working_directory: cwd,
    transcript_path: transcriptPath ?? first.transcriptPath ?? null,
    provider: "claude-code",
    metadata
  }, false);
  let messages = 0;
  let tools = 0;
  let maxSequence = startAfterSequence;
  for (const event of events) {
    if (event.sequence <= startAfterSequence) continue;
    maxSequence = Math.max(maxSequence, event.sequence);
    const eventWorkspace = workspaceName(event.cwd || cwd);
    if (cfg.trackMessages && event.prompt) {
      await post(cfg, "track-message", {
        session_id: claudeSessionId,
        role: "user",
        message_type: "prompt",
        workspace_name: eventWorkspace,
        timestamp: isoTime(event.receivedAt),
        content: event.prompt,
        metadata: { event: event.hookEventName, char_count: event.prompt.length, sequence: event.sequence, source: "claude-code-hooks" }
      }, true);
      messages += 1;
    }
    if (cfg.trackMessages && typeof event.lastAssistantMessage === "string" && event.lastAssistantMessage.trim()) {
      await post(cfg, "track-message", {
        session_id: claudeSessionId,
        role: "assistant",
        message_type: "response",
        workspace_name: eventWorkspace,
        timestamp: isoTime(event.receivedAt),
        content: event.lastAssistantMessage,
        metadata: { event: event.hookEventName, char_count: event.lastAssistantMessage.length, sequence: event.sequence, source: "claude-code-hooks" }
      }, true);
      messages += 1;
    }
    if (event.toolName && event.hookEventName === "PostToolUse") {
      await post(cfg, "track-tool-call", {
        session_id: claudeSessionId,
        tool_name: event.toolName,
        workspace_name: eventWorkspace,
        timestamp: isoTime(event.receivedAt),
        input_summary: summarizePayload2(event.toolInput),
        output_summary: summarizePayload2(event.toolResponse),
        metadata: {
          cwd: event.cwd,
          success: successfulToolEvent(event),
          tool_use_id: event.toolUseId,
          hook_event_name: event.hookEventName,
          sequence: event.sequence,
          source: "claude-code-hooks"
        }
      }, true);
      tools += 1;
      if (cfg.trackGit && event.toolName === "Bash") {
        const command = extractCommand2(event.toolInput);
        if (command && isGitOperation(command)) {
          const operation = parseGitOperation(command);
          const output = outputText(event.toolResponse);
          await post(cfg, "track-git", {
            session_id: claudeSessionId,
            operation_type: operation,
            repository_path: event.cwd || cwd,
            branch: "unknown",
            commit_hash: extractCommitHash(output),
            commit_message: extractCommitMessage(command),
            metadata: { operation, command: command.slice(0, 500), workspace: eventWorkspace, source: "claude-code-hooks" }
          }, true);
        }
      }
    }
  }
  const recountMessages = Math.max(summary?.messageCount ?? 0, countMessages(events));
  const recountTools = countToolCalls(events);
  const priorMessages = prior?.messageCount ?? 0;
  const priorTools = prior?.toolCallCount ?? 0;
  const wouldLower = recountMessages < priorMessages || recountTools < priorTools;
  if (wouldLower) {
    return {
      messages,
      tools,
      maxSequence,
      sessionMessageCount: priorMessages,
      sessionToolCallCount: priorTools
    };
  }
  await post(cfg, "session-end", {
    session_id: claudeSessionId,
    ended_at: isoTime(last.receivedAt),
    message_count: recountMessages,
    tool_call_count: recountTools,
    outcome_summary: outcomeSummary(events, summary),
    success: true,
    metadata: {
      user_messages: events.filter((e) => e.prompt).length,
      assistant_messages: events.filter((e) => e.lastAssistantMessage).length,
      files_changed: summary?.filesChanged,
      ...metadata
    }
  }, true);
  return {
    messages,
    tools,
    maxSequence,
    sessionMessageCount: recountMessages,
    sessionToolCallCount: recountTools
  };
}

// src/lib/writer.ts
async function writeDirectUnit(input) {
  const { config, walletAddress, auth, claudeSessionId, events, summary, transcriptPath } = input;
  const deriveHeaders = auth.deriveHeaders;
  const traces = buildTraces({ walletAddress, claudeSessionId, events, summary });
  const bundle = buildGraphWriteBundle(walletAddress, traces);
  const operations = bundle.operations;
  if (summary?.plans?.length && traces.length > 0) {
    operations.push(...buildPlanOperations(summary.plans, claudeCodeSessionNodeId(traces[0])));
  }
  const writeUrl = `${config.api_url.replace(/\/$/, "")}/api/v1/write`;
  const artifactResult = await writeContentArtifacts(config, auth, bundle.contentArtifacts);
  let graphOk = true;
  const batches = batchOperations(operations);
  for (let i = 0; i < batches.length; i++) {
    const body = { operations: batches[i], skip_embedding: true };
    const dedupeKey = `graph:${claudeSessionId}:${i}`;
    if (!deriveHeaders) {
      enqueue({ url: writeUrl, body, requiresBearer: true, requiresDerive: true, dedupeKey });
      graphOk = false;
      continue;
    }
    try {
      const result = await postJson(writeUrl, body, kfdbAuthHeaders(auth, "POST", writeUrl), GRAPH_WRITE_TIMEOUT_MS);
      if (!result.ok) {
        enqueue({ url: writeUrl, body, requiresBearer: true, requiresDerive: true, dedupeKey });
        graphOk = false;
        log("warn", "graph batch failed; queued", { sessionId: claudeSessionId, status: result.status });
      }
    } catch (err) {
      enqueue({ url: writeUrl, body, requiresBearer: true, requiresDerive: true, dedupeKey });
      graphOk = false;
      log("warn", "graph batch error; queued", { sessionId: claudeSessionId, error: err.message });
    }
  }
  let messages = 0;
  let tools = 0;
  let maxSequence = input.legacyStreamMaxSequence;
  let legacyOk = false;
  let sessionMessageCount = input.priorMessageCount ?? 0;
  let sessionToolCallCount = input.priorToolCallCount ?? 0;
  if (deriveHeaders) {
    try {
      const result = await writeLegacyStream(
        { apiUrl: config.api_url, auth, trackMessages: config.track_messages, trackFiles: config.track_files, trackGit: config.track_git },
        claudeSessionId,
        events,
        input.legacyStreamMaxSequence,
        summary,
        transcriptPath,
        { messageCount: input.priorMessageCount, toolCallCount: input.priorToolCallCount }
      );
      messages = result.messages;
      tools = result.tools;
      maxSequence = result.maxSequence;
      sessionMessageCount = result.sessionMessageCount;
      sessionToolCallCount = result.sessionToolCallCount;
      legacyOk = true;
    } catch (err) {
      log("warn", "legacy stream failed", { sessionId: claudeSessionId, error: err.message });
    }
  }
  return { ops: operations.length, graphOk, artifactOk: artifactResult.ok, artifacts: artifactResult.attempted, messages, tools, maxSequence, legacyOk, sessionMessageCount, sessionToolCallCount };
}
function writeGatewayUnit(input) {
  const traces = buildTraces({
    walletAddress: input.walletAddress,
    claudeSessionId: input.claudeSessionId,
    events: input.events,
    summary: input.summary
  });
  return writeSpool(input.spoolDir, traces);
}

// src/lib/cli-help.ts
function wantsHelp(args) {
  return args.includes("--help") || args.includes("-h");
}

// src/flush.ts
var USAGE = `usage: node flush.mjs <sessionId> [--final]

Detached worker: flush a session's pending events to the resolved sink. Normally
spawned by capture on Stop/SessionEnd, not run by hand.

  <sessionId>   the session to flush
  --final       clear the pending log after flushing
  -h, --help    show this help and exit
`;
async function main() {
  const args = process.argv.slice(2);
  if (wantsHelp(args)) {
    process.stdout.write(USAGE);
    return;
  }
  const sessionId = args.find((a) => !a.startsWith("--")) ?? "unknown";
  const final = args.includes("--final");
  const config = loadConfig();
  setLogLevel(config.log_level);
  const sink = resolveSink(config);
  if (sink === "off") {
    log("debug", "flush skipped: sink off", { sessionId });
    return;
  }
  const events = readPending(sessionId);
  if (events.length === 0) {
    log("debug", "flush skipped: no pending events", { sessionId });
    return;
  }
  const claudeSessionId = events[0].claudeSessionId || sessionId;
  if (final) {
    await acquireFlushLockOrWait(PENDING_DIR, claudeSessionId);
  } else if (!acquireFlushLock(PENDING_DIR, claudeSessionId)) {
    log("debug", "flush skipped: another flush in progress", { sessionId: claudeSessionId });
    return;
  }
  try {
    const transcriptPath = resolveTranscriptPath(events, claudeSessionId);
    const summary = transcriptPath ? parseTranscriptSummary(transcriptPath) : void 0;
    const fingerprint = computeFingerprint(claudeSessionId, sink, events);
    const state = readState();
    const prior = flushedEntry(state, claudeSessionId);
    if (prior.fingerprint === fingerprint && !final) {
      await commitFlushedEntry(claudeSessionId, {});
      log("debug", "flush skipped: unchanged fingerprint", { sessionId: claudeSessionId });
      return;
    }
    if (sink === "gateway") {
      await flushGateway(claudeSessionId, events, summary);
    } else {
      await flushDirect(config, claudeSessionId, events, summary, transcriptPath, prior, state);
    }
    setFlushedEntry(state, claudeSessionId, { fingerprint });
    await commitFlushedEntry(claudeSessionId, flushedEntry(state, claudeSessionId));
    if (final) clearPending(claudeSessionId);
  } finally {
    releaseFlushLock(PENDING_DIR, claudeSessionId);
  }
}
function resolveTranscriptPath(events, claudeSessionId) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].transcriptPath) return events[i].transcriptPath;
  }
  return findTranscriptForSession(claudeSessionId);
}
async function flushGateway(claudeSessionId, events, summary) {
  const spoolDir = process.env.RD_SPOOL_DIR;
  if (!spoolDir) {
    log("warn", "gateway sink but RD_SPOOL_DIR unset", { sessionId: claudeSessionId });
    return;
  }
  const walletAddress = (process.env.RD_WALLET_ADDRESS || "").toLowerCase();
  const written = writeGatewayUnit({ spoolDir, walletAddress, claudeSessionId, events, summary });
  log("info", "gateway spool written", { sessionId: claudeSessionId, files: written.length });
}
async function flushDirect(config, claudeSessionId, events, summary, transcriptPath, prior, state) {
  if (!config.private_key) {
    log("warn", "direct sink but no private_key", { sessionId: claudeSessionId });
    return;
  }
  const walletAddress = addressFromPrivateKey(config.private_key).toLowerCase();
  let deriveHeaders;
  try {
    deriveHeaders = await getDeriveHeaders({ apiUrl: config.api_url, apiKey: config.api_key, privateKey: config.private_key });
  } catch (err) {
    log("warn", "derive failed; queueing graph only", { sessionId: claudeSessionId, error: err.message });
  }
  const auth = kfdbAuthFromConfig(config, deriveHeaders);
  if (deriveHeaders) {
    try {
      const drained = await drainQueue(auth);
      if (drained.sent > 0 || drained.remaining > 0) log("info", "queue drained", drained);
    } catch {
    }
  }
  const result = await writeDirectUnit({
    config,
    walletAddress,
    auth,
    claudeSessionId,
    events,
    summary,
    transcriptPath,
    legacyStreamMaxSequence: prior.legacyStreamMaxSequence ?? -1,
    priorMessageCount: prior.lastMessageCount,
    priorToolCallCount: prior.lastToolCallCount
  });
  log("info", "flush direct complete", {
    sessionId: claudeSessionId,
    ops: result.ops,
    messages: result.messages,
    tools: result.tools,
    graphOk: result.graphOk,
    artifactOk: result.artifactOk,
    artifacts: result.artifacts,
    legacyOk: result.legacyOk
  });
  setFlushedEntry(state, claudeSessionId, {
    legacyStreamMaxSequence: result.maxSequence,
    lastMessageCount: result.sessionMessageCount,
    lastToolCallCount: result.sessionToolCallCount
  });
}
main().catch((err) => {
  try {
    log("error", "flush failed", { error: err.message });
  } catch {
  }
}).finally(() => process.exit(0));
