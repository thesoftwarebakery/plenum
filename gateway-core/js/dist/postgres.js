var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// deno:https://deno.land/std@0.214.0/encoding/base64.ts
var base64_exports = {};
__export(base64_exports, {
  decodeBase64: () => decodeBase64,
  encodeBase64: () => encodeBase64
});

// deno:https://deno.land/std@0.214.0/encoding/_util.ts
var encoder = new TextEncoder();
function getTypeName(value) {
  const type = typeof value;
  if (type !== "object") {
    return type;
  } else if (value === null) {
    return "null";
  } else {
    return value?.constructor?.name ?? "object";
  }
}
function validateBinaryLike(source) {
  if (typeof source === "string") {
    return encoder.encode(source);
  } else if (source instanceof Uint8Array) {
    return source;
  } else if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  throw new TypeError(`The input must be a Uint8Array, a string, or an ArrayBuffer. Received a value of the type ${getTypeName(source)}.`);
}

// deno:https://deno.land/std@0.214.0/encoding/base64.ts
var base64abc = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "+",
  "/"
];
function encodeBase64(data) {
  const uint8 = validateBinaryLike(data);
  let result = "", i;
  const l = uint8.length;
  for (i = 2; i < l; i += 3) {
    result += base64abc[uint8[i - 2] >> 2];
    result += base64abc[(uint8[i - 2] & 3) << 4 | uint8[i - 1] >> 4];
    result += base64abc[(uint8[i - 1] & 15) << 2 | uint8[i] >> 6];
    result += base64abc[uint8[i] & 63];
  }
  if (i === l + 1) {
    result += base64abc[uint8[i - 2] >> 2];
    result += base64abc[(uint8[i - 2] & 3) << 4];
    result += "==";
  }
  if (i === l) {
    result += base64abc[uint8[i - 2] >> 2];
    result += base64abc[(uint8[i - 2] & 3) << 4 | uint8[i - 1] >> 4];
    result += base64abc[(uint8[i - 1] & 15) << 2];
    result += "=";
  }
  return result;
}
function decodeBase64(b64) {
  const binString = atob(b64);
  const size = binString.length;
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    bytes[i] = binString.charCodeAt(i);
  }
  return bytes;
}

// deno:https://deno.land/std@0.214.0/encoding/hex.ts
var hex_exports = {};
__export(hex_exports, {
  decodeHex: () => decodeHex,
  encodeHex: () => encodeHex
});
var hexTable = new TextEncoder().encode("0123456789abcdef");
var textEncoder = new TextEncoder();
var textDecoder = new TextDecoder();
function errInvalidByte(byte) {
  return new TypeError(`Invalid byte '${String.fromCharCode(byte)}'`);
}
function errLength() {
  return new RangeError("Odd length hex string");
}
function fromHexChar(byte) {
  if (48 <= byte && byte <= 57) return byte - 48;
  if (97 <= byte && byte <= 102) return byte - 97 + 10;
  if (65 <= byte && byte <= 70) return byte - 65 + 10;
  throw errInvalidByte(byte);
}
function encodeHex(src) {
  const u8 = validateBinaryLike(src);
  const dst = new Uint8Array(u8.length * 2);
  for (let i = 0; i < dst.length; i++) {
    const v = u8[i];
    dst[i * 2] = hexTable[v >> 4];
    dst[i * 2 + 1] = hexTable[v & 15];
  }
  return textDecoder.decode(dst);
}
function decodeHex(src) {
  const u8 = textEncoder.encode(src);
  const dst = new Uint8Array(u8.length / 2);
  for (let i = 0; i < dst.length; i++) {
    const a = fromHexChar(u8[i * 2]);
    const b = fromHexChar(u8[i * 2 + 1]);
    dst[i] = a << 4 | b;
  }
  if (u8.length % 2 === 1) {
    fromHexChar(u8[dst.length * 2]);
    throw errLength();
  }
  return dst;
}

// deno:https://deno.land/std@0.214.0/datetime/_common.ts
var Tokenizer = class {
  rules;
  constructor(rules = []) {
    this.rules = rules;
  }
  addRule(test, fn) {
    this.rules.push({
      test,
      fn
    });
    return this;
  }
  tokenize(string, receiver = (token) => token) {
    function* generator(rules) {
      let index = 0;
      for (const rule of rules) {
        const result = rule.test(string);
        if (result) {
          const { value, length } = result;
          index += length;
          string = string.slice(length);
          const token = {
            ...rule.fn(value),
            index
          };
          yield receiver(token);
          yield* generator(rules);
        }
      }
    }
    const tokenGenerator = generator(this.rules);
    const tokens = [];
    for (const token of tokenGenerator) {
      tokens.push(token);
    }
    if (string.length) {
      throw new Error(`parser error: string not fully parsed! ${string.slice(0, 25)}`);
    }
    return tokens;
  }
};
function digits(value, count = 2) {
  return String(value).padStart(count, "0");
}
function createLiteralTestFunction(value) {
  return (string) => {
    return string.startsWith(value) ? {
      value,
      length: value.length
    } : void 0;
  };
}
function createMatchTestFunction(match) {
  return (string) => {
    const result = match.exec(string);
    if (result) return {
      value: result,
      length: result[0].length
    };
  };
}
var defaultRules = [
  {
    test: createLiteralTestFunction("yyyy"),
    fn: () => ({
      type: "year",
      value: "numeric"
    })
  },
  {
    test: createLiteralTestFunction("yy"),
    fn: () => ({
      type: "year",
      value: "2-digit"
    })
  },
  {
    test: createLiteralTestFunction("MM"),
    fn: () => ({
      type: "month",
      value: "2-digit"
    })
  },
  {
    test: createLiteralTestFunction("M"),
    fn: () => ({
      type: "month",
      value: "numeric"
    })
  },
  {
    test: createLiteralTestFunction("dd"),
    fn: () => ({
      type: "day",
      value: "2-digit"
    })
  },
  {
    test: createLiteralTestFunction("d"),
    fn: () => ({
      type: "day",
      value: "numeric"
    })
  },
  {
    test: createLiteralTestFunction("HH"),
    fn: () => ({
      type: "hour",
      value: "2-digit"
    })
  },
  {
    test: createLiteralTestFunction("H"),
    fn: () => ({
      type: "hour",
      value: "numeric"
    })
  },
  {
    test: createLiteralTestFunction("hh"),
    fn: () => ({
      type: "hour",
      value: "2-digit",
      hour12: true
    })
  },
  {
    test: createLiteralTestFunction("h"),
    fn: () => ({
      type: "hour",
      value: "numeric",
      hour12: true
    })
  },
  {
    test: createLiteralTestFunction("mm"),
    fn: () => ({
      type: "minute",
      value: "2-digit"
    })
  },
  {
    test: createLiteralTestFunction("m"),
    fn: () => ({
      type: "minute",
      value: "numeric"
    })
  },
  {
    test: createLiteralTestFunction("ss"),
    fn: () => ({
      type: "second",
      value: "2-digit"
    })
  },
  {
    test: createLiteralTestFunction("s"),
    fn: () => ({
      type: "second",
      value: "numeric"
    })
  },
  {
    test: createLiteralTestFunction("SSS"),
    fn: () => ({
      type: "fractionalSecond",
      value: 3
    })
  },
  {
    test: createLiteralTestFunction("SS"),
    fn: () => ({
      type: "fractionalSecond",
      value: 2
    })
  },
  {
    test: createLiteralTestFunction("S"),
    fn: () => ({
      type: "fractionalSecond",
      value: 1
    })
  },
  {
    test: createLiteralTestFunction("a"),
    fn: (value) => ({
      type: "dayPeriod",
      value
    })
  },
  // quoted literal
  {
    test: createMatchTestFunction(/^(')(?<value>\\.|[^\']*)\1/),
    fn: (match) => ({
      type: "literal",
      value: match.groups.value
    })
  },
  // literal
  {
    test: createMatchTestFunction(/^.+?\s*/),
    fn: (match) => ({
      type: "literal",
      value: match[0]
    })
  }
];
var DateTimeFormatter = class {
  #format;
  constructor(formatString, rules = defaultRules) {
    const tokenizer = new Tokenizer(rules);
    this.#format = tokenizer.tokenize(formatString, ({ type, value, hour12 }) => {
      const result = {
        type,
        value
      };
      if (hour12) result.hour12 = hour12;
      return result;
    });
  }
  format(date, options = {}) {
    let string = "";
    const utc = options.timeZone === "UTC";
    for (const token of this.#format) {
      const type = token.type;
      switch (type) {
        case "year": {
          const value = utc ? date.getUTCFullYear() : date.getFullYear();
          switch (token.value) {
            case "numeric": {
              string += value;
              break;
            }
            case "2-digit": {
              string += digits(value, 2).slice(-2);
              break;
            }
            default:
              throw Error(`FormatterError: value "${token.value}" is not supported`);
          }
          break;
        }
        case "month": {
          const value = (utc ? date.getUTCMonth() : date.getMonth()) + 1;
          switch (token.value) {
            case "numeric": {
              string += value;
              break;
            }
            case "2-digit": {
              string += digits(value, 2);
              break;
            }
            default:
              throw Error(`FormatterError: value "${token.value}" is not supported`);
          }
          break;
        }
        case "day": {
          const value = utc ? date.getUTCDate() : date.getDate();
          switch (token.value) {
            case "numeric": {
              string += value;
              break;
            }
            case "2-digit": {
              string += digits(value, 2);
              break;
            }
            default:
              throw Error(`FormatterError: value "${token.value}" is not supported`);
          }
          break;
        }
        case "hour": {
          let value = utc ? date.getUTCHours() : date.getHours();
          if (token.hour12) {
            if (value === 0) value = 12;
            else if (value > 12) value -= 12;
          }
          switch (token.value) {
            case "numeric": {
              string += value;
              break;
            }
            case "2-digit": {
              string += digits(value, 2);
              break;
            }
            default:
              throw Error(`FormatterError: value "${token.value}" is not supported`);
          }
          break;
        }
        case "minute": {
          const value = utc ? date.getUTCMinutes() : date.getMinutes();
          switch (token.value) {
            case "numeric": {
              string += value;
              break;
            }
            case "2-digit": {
              string += digits(value, 2);
              break;
            }
            default:
              throw Error(`FormatterError: value "${token.value}" is not supported`);
          }
          break;
        }
        case "second": {
          const value = utc ? date.getUTCSeconds() : date.getSeconds();
          switch (token.value) {
            case "numeric": {
              string += value;
              break;
            }
            case "2-digit": {
              string += digits(value, 2);
              break;
            }
            default:
              throw Error(`FormatterError: value "${token.value}" is not supported`);
          }
          break;
        }
        case "fractionalSecond": {
          const value = utc ? date.getUTCMilliseconds() : date.getMilliseconds();
          string += digits(value, Number(token.value));
          break;
        }
        // FIXME(bartlomieju)
        case "timeZoneName": {
          break;
        }
        case "dayPeriod": {
          string += token.value ? date.getHours() >= 12 ? "PM" : "AM" : "";
          break;
        }
        case "literal": {
          string += token.value;
          break;
        }
        default:
          throw Error(`FormatterError: { ${token.type} ${token.value} }`);
      }
    }
    return string;
  }
  parseToParts(string) {
    const parts = [];
    for (const token of this.#format) {
      const type = token.type;
      let value = "";
      switch (token.type) {
        case "year": {
          switch (token.value) {
            case "numeric": {
              value = /^\d{1,4}/.exec(string)?.[0];
              break;
            }
            case "2-digit": {
              value = /^\d{1,2}/.exec(string)?.[0];
              break;
            }
          }
          break;
        }
        case "month": {
          switch (token.value) {
            case "numeric": {
              value = /^\d{1,2}/.exec(string)?.[0];
              break;
            }
            case "2-digit": {
              value = /^\d{2}/.exec(string)?.[0];
              break;
            }
            case "narrow": {
              value = /^[a-zA-Z]+/.exec(string)?.[0];
              break;
            }
            case "short": {
              value = /^[a-zA-Z]+/.exec(string)?.[0];
              break;
            }
            case "long": {
              value = /^[a-zA-Z]+/.exec(string)?.[0];
              break;
            }
            default:
              throw Error(`ParserError: value "${token.value}" is not supported`);
          }
          break;
        }
        case "day": {
          switch (token.value) {
            case "numeric": {
              value = /^\d{1,2}/.exec(string)?.[0];
              break;
            }
            case "2-digit": {
              value = /^\d{2}/.exec(string)?.[0];
              break;
            }
            default:
              throw Error(`ParserError: value "${token.value}" is not supported`);
          }
          break;
        }
        case "hour": {
          switch (token.value) {
            case "numeric": {
              value = /^\d{1,2}/.exec(string)?.[0];
              if (token.hour12 && parseInt(value) > 12) {
                console.error(`Trying to parse hour greater than 12. Use 'H' instead of 'h'.`);
              }
              break;
            }
            case "2-digit": {
              value = /^\d{2}/.exec(string)?.[0];
              if (token.hour12 && parseInt(value) > 12) {
                console.error(`Trying to parse hour greater than 12. Use 'HH' instead of 'hh'.`);
              }
              break;
            }
            default:
              throw Error(`ParserError: value "${token.value}" is not supported`);
          }
          break;
        }
        case "minute": {
          switch (token.value) {
            case "numeric": {
              value = /^\d{1,2}/.exec(string)?.[0];
              break;
            }
            case "2-digit": {
              value = /^\d{2}/.exec(string)?.[0];
              break;
            }
            default:
              throw Error(`ParserError: value "${token.value}" is not supported`);
          }
          break;
        }
        case "second": {
          switch (token.value) {
            case "numeric": {
              value = /^\d{1,2}/.exec(string)?.[0];
              break;
            }
            case "2-digit": {
              value = /^\d{2}/.exec(string)?.[0];
              break;
            }
            default:
              throw Error(`ParserError: value "${token.value}" is not supported`);
          }
          break;
        }
        case "fractionalSecond": {
          value = new RegExp(`^\\d{${token.value}}`).exec(string)?.[0];
          break;
        }
        case "timeZoneName": {
          value = token.value;
          break;
        }
        case "dayPeriod": {
          value = /^(A|P)M/.exec(string)?.[0];
          break;
        }
        case "literal": {
          if (!string.startsWith(token.value)) {
            throw Error(`Literal "${token.value}" not found "${string.slice(0, 25)}"`);
          }
          value = token.value;
          break;
        }
        default:
          throw Error(`${token.type} ${token.value}`);
      }
      if (!value) {
        throw Error(`value not valid for token { ${type} ${value} } ${string.slice(0, 25)}`);
      }
      parts.push({
        type,
        value
      });
      string = string.slice(value.length);
    }
    if (string.length) {
      throw Error(`datetime string was not fully parsed! ${string.slice(0, 25)}`);
    }
    return parts;
  }
  /** sort & filter dateTimeFormatPart */
  sortDateTimeFormatPart(parts) {
    let result = [];
    const typeArray = [
      "year",
      "month",
      "day",
      "hour",
      "minute",
      "second",
      "fractionalSecond"
    ];
    for (const type of typeArray) {
      const current = parts.findIndex((el) => el.type === type);
      if (current !== -1) {
        result = result.concat(parts.splice(current, 1));
      }
    }
    result = result.concat(parts);
    return result;
  }
  partsToDate(parts) {
    const date = /* @__PURE__ */ new Date();
    const utc = parts.find((part) => part.type === "timeZoneName" && part.value === "UTC");
    const dayPart = parts.find((part) => part.type === "day");
    utc ? date.setUTCHours(0, 0, 0, 0) : date.setHours(0, 0, 0, 0);
    for (const part of parts) {
      switch (part.type) {
        case "year": {
          const value = Number(part.value.padStart(4, "20"));
          utc ? date.setUTCFullYear(value) : date.setFullYear(value);
          break;
        }
        case "month": {
          const value = Number(part.value) - 1;
          if (dayPart) {
            utc ? date.setUTCMonth(value, Number(dayPart.value)) : date.setMonth(value, Number(dayPart.value));
          } else {
            utc ? date.setUTCMonth(value) : date.setMonth(value);
          }
          break;
        }
        case "day": {
          const value = Number(part.value);
          utc ? date.setUTCDate(value) : date.setDate(value);
          break;
        }
        case "hour": {
          let value = Number(part.value);
          const dayPeriod = parts.find((part2) => part2.type === "dayPeriod");
          if (dayPeriod?.value === "PM") value += 12;
          utc ? date.setUTCHours(value) : date.setHours(value);
          break;
        }
        case "minute": {
          const value = Number(part.value);
          utc ? date.setUTCMinutes(value) : date.setMinutes(value);
          break;
        }
        case "second": {
          const value = Number(part.value);
          utc ? date.setUTCSeconds(value) : date.setSeconds(value);
          break;
        }
        case "fractionalSecond": {
          const value = Number(part.value);
          utc ? date.setUTCMilliseconds(value) : date.setMilliseconds(value);
          break;
        }
      }
    }
    return date;
  }
  parse(string) {
    const parts = this.parseToParts(string);
    const sortParts = this.sortDateTimeFormatPart(parts);
    return this.partsToDate(sortParts);
  }
};

// deno:https://deno.land/std@0.214.0/datetime/parse.ts
function parse(dateString, formatString) {
  const formatter = new DateTimeFormatter(formatString);
  const parts = formatter.parseToParts(dateString);
  const sortParts = formatter.sortDateTimeFormatPart(parts);
  return formatter.partsToDate(sortParts);
}

// deno:https://deno.land/std@0.214.0/assert/assertion_error.ts
var AssertionError = class extends Error {
  /** Constructs a new instance. */
  constructor(message) {
    super(message);
    this.name = "AssertionError";
  }
};

// deno:https://deno.land/std@0.214.0/assert/assert.ts
function assert(expr, msg = "") {
  if (!expr) {
    throw new AssertionError(msg);
  }
}

// deno:https://deno.land/std@0.214.0/bytes/copy.ts
function copy(src, dst, off = 0) {
  off = Math.max(0, Math.min(off, dst.byteLength));
  const dstBytesAvailable = dst.byteLength - off;
  if (src.byteLength > dstBytesAvailable) {
    src = src.subarray(0, dstBytesAvailable);
  }
  dst.set(src, off);
  return src.byteLength;
}

// deno:https://deno.land/std@0.214.0/io/buf_reader.ts
var DEFAULT_BUF_SIZE = 4096;
var MIN_BUF_SIZE = 16;
var MAX_CONSECUTIVE_EMPTY_READS = 100;
var CR = "\r".charCodeAt(0);
var LF = "\n".charCodeAt(0);
var BufferFullError = class extends Error {
  partial;
  name;
  constructor(partial) {
    super("Buffer full"), this.partial = partial, this.name = "BufferFullError";
  }
};
var PartialReadError = class extends Error {
  name = "PartialReadError";
  partial;
  constructor() {
    super("Encountered UnexpectedEof, data only partially read");
  }
};
var BufReader = class _BufReader {
  #buf;
  #rd;
  #r = 0;
  #w = 0;
  #eof = false;
  // private lastByte: number;
  // private lastCharSize: number;
  /** return new BufReader unless r is BufReader */
  static create(r, size = DEFAULT_BUF_SIZE) {
    return r instanceof _BufReader ? r : new _BufReader(r, size);
  }
  constructor(rd, size = DEFAULT_BUF_SIZE) {
    if (size < MIN_BUF_SIZE) {
      size = MIN_BUF_SIZE;
    }
    this.#reset(new Uint8Array(size), rd);
  }
  /** Returns the size of the underlying buffer in bytes. */
  size() {
    return this.#buf.byteLength;
  }
  buffered() {
    return this.#w - this.#r;
  }
  // Reads a new chunk into the buffer.
  #fill = async () => {
    if (this.#r > 0) {
      this.#buf.copyWithin(0, this.#r, this.#w);
      this.#w -= this.#r;
      this.#r = 0;
    }
    if (this.#w >= this.#buf.byteLength) {
      throw Error("bufio: tried to fill full buffer");
    }
    for (let i = MAX_CONSECUTIVE_EMPTY_READS; i > 0; i--) {
      const rr = await this.#rd.read(this.#buf.subarray(this.#w));
      if (rr === null) {
        this.#eof = true;
        return;
      }
      assert(rr >= 0, "negative read");
      this.#w += rr;
      if (rr > 0) {
        return;
      }
    }
    throw new Error(`No progress after ${MAX_CONSECUTIVE_EMPTY_READS} read() calls`);
  };
  /** Discards any buffered data, resets all state, and switches
   * the buffered reader to read from r.
   */
  reset(r) {
    this.#reset(this.#buf, r);
  }
  #reset = (buf, rd) => {
    this.#buf = buf;
    this.#rd = rd;
    this.#eof = false;
  };
  /** reads data into p.
   * It returns the number of bytes read into p.
   * The bytes are taken from at most one Read on the underlying Reader,
   * hence n may be less than len(p).
   * To read exactly len(p) bytes, use io.ReadFull(b, p).
   */
  async read(p) {
    let rr = p.byteLength;
    if (p.byteLength === 0) return rr;
    if (this.#r === this.#w) {
      if (p.byteLength >= this.#buf.byteLength) {
        const rr2 = await this.#rd.read(p);
        const nread = rr2 ?? 0;
        assert(nread >= 0, "negative read");
        return rr2;
      }
      this.#r = 0;
      this.#w = 0;
      rr = await this.#rd.read(this.#buf);
      if (rr === 0 || rr === null) return rr;
      assert(rr >= 0, "negative read");
      this.#w += rr;
    }
    const copied = copy(this.#buf.subarray(this.#r, this.#w), p, 0);
    this.#r += copied;
    return copied;
  }
  /** reads exactly `p.length` bytes into `p`.
   *
   * If successful, `p` is returned.
   *
   * If the end of the underlying stream has been reached, and there are no more
   * bytes available in the buffer, `readFull()` returns `null` instead.
   *
   * An error is thrown if some bytes could be read, but not enough to fill `p`
   * entirely before the underlying stream reported an error or EOF. Any error
   * thrown will have a `partial` property that indicates the slice of the
   * buffer that has been successfully filled with data.
   *
   * Ported from https://golang.org/pkg/io/#ReadFull
   */
  async readFull(p) {
    let bytesRead = 0;
    while (bytesRead < p.length) {
      try {
        const rr = await this.read(p.subarray(bytesRead));
        if (rr === null) {
          if (bytesRead === 0) {
            return null;
          } else {
            throw new PartialReadError();
          }
        }
        bytesRead += rr;
      } catch (err) {
        if (err instanceof PartialReadError) {
          err.partial = p.subarray(0, bytesRead);
        }
        throw err;
      }
    }
    return p;
  }
  /** Returns the next byte [0, 255] or `null`. */
  async readByte() {
    while (this.#r === this.#w) {
      if (this.#eof) return null;
      await this.#fill();
    }
    const c = this.#buf[this.#r];
    this.#r++;
    return c;
  }
  /** readString() reads until the first occurrence of delim in the input,
   * returning a string containing the data up to and including the delimiter.
   * If ReadString encounters an error before finding a delimiter,
   * it returns the data read before the error and the error itself
   * (often `null`).
   * ReadString returns err !== null if and only if the returned data does not end
   * in delim.
   * For simple uses, a Scanner may be more convenient.
   */
  async readString(delim) {
    if (delim.length !== 1) {
      throw new Error("Delimiter should be a single character");
    }
    const buffer = await this.readSlice(delim.charCodeAt(0));
    if (buffer === null) return null;
    return new TextDecoder().decode(buffer);
  }
  /** `readLine()` is a low-level line-reading primitive. Most callers should
   * use `readString('\n')` instead or use a Scanner.
   *
   * `readLine()` tries to return a single line, not including the end-of-line
   * bytes. If the line was too long for the buffer then `more` is set and the
   * beginning of the line is returned. The rest of the line will be returned
   * from future calls. `more` will be false when returning the last fragment
   * of the line. The returned buffer is only valid until the next call to
   * `readLine()`.
   *
   * The text returned from ReadLine does not include the line end ("\r\n" or
   * "\n").
   *
   * When the end of the underlying stream is reached, the final bytes in the
   * stream are returned. No indication or error is given if the input ends
   * without a final line end. When there are no more trailing bytes to read,
   * `readLine()` returns `null`.
   *
   * Calling `unreadByte()` after `readLine()` will always unread the last byte
   * read (possibly a character belonging to the line end) even if that byte is
   * not part of the line returned by `readLine()`.
   */
  async readLine() {
    let line = null;
    try {
      line = await this.readSlice(LF);
    } catch (err) {
      let partial;
      if (err instanceof PartialReadError) {
        partial = err.partial;
        assert(partial instanceof Uint8Array, "bufio: caught error from `readSlice()` without `partial` property");
      }
      if (!(err instanceof BufferFullError)) {
        throw err;
      }
      partial = err.partial;
      if (!this.#eof && partial && partial.byteLength > 0 && partial[partial.byteLength - 1] === CR) {
        assert(this.#r > 0, "bufio: tried to rewind past start of buffer");
        this.#r--;
        partial = partial.subarray(0, partial.byteLength - 1);
      }
      if (partial) {
        return {
          line: partial,
          more: !this.#eof
        };
      }
    }
    if (line === null) {
      return null;
    }
    if (line.byteLength === 0) {
      return {
        line,
        more: false
      };
    }
    if (line[line.byteLength - 1] === LF) {
      let drop = 1;
      if (line.byteLength > 1 && line[line.byteLength - 2] === CR) {
        drop = 2;
      }
      line = line.subarray(0, line.byteLength - drop);
    }
    return {
      line,
      more: false
    };
  }
  /** `readSlice()` reads until the first occurrence of `delim` in the input,
   * returning a slice pointing at the bytes in the buffer. The bytes stop
   * being valid at the next read.
   *
   * If `readSlice()` encounters an error before finding a delimiter, or the
   * buffer fills without finding a delimiter, it throws an error with a
   * `partial` property that contains the entire buffer.
   *
   * If `readSlice()` encounters the end of the underlying stream and there are
   * any bytes left in the buffer, the rest of the buffer is returned. In other
   * words, EOF is always treated as a delimiter. Once the buffer is empty,
   * it returns `null`.
   *
   * Because the data returned from `readSlice()` will be overwritten by the
   * next I/O operation, most clients should use `readString()` instead.
   */
  async readSlice(delim) {
    let s = 0;
    let slice;
    while (true) {
      let i = this.#buf.subarray(this.#r + s, this.#w).indexOf(delim);
      if (i >= 0) {
        i += s;
        slice = this.#buf.subarray(this.#r, this.#r + i + 1);
        this.#r += i + 1;
        break;
      }
      if (this.#eof) {
        if (this.#r === this.#w) {
          return null;
        }
        slice = this.#buf.subarray(this.#r, this.#w);
        this.#r = this.#w;
        break;
      }
      if (this.buffered() >= this.#buf.byteLength) {
        this.#r = this.#w;
        const oldbuf = this.#buf;
        const newbuf = this.#buf.slice(0);
        this.#buf = newbuf;
        throw new BufferFullError(oldbuf);
      }
      s = this.#w - this.#r;
      try {
        await this.#fill();
      } catch (err) {
        if (err instanceof PartialReadError) {
          err.partial = slice;
        }
        throw err;
      }
    }
    return slice;
  }
  /** `peek()` returns the next `n` bytes without advancing the reader. The
   * bytes stop being valid at the next read call.
   *
   * When the end of the underlying stream is reached, but there are unread
   * bytes left in the buffer, those bytes are returned. If there are no bytes
   * left in the buffer, it returns `null`.
   *
   * If an error is encountered before `n` bytes are available, `peek()` throws
   * an error with the `partial` property set to a slice of the buffer that
   * contains the bytes that were available before the error occurred.
   */
  async peek(n) {
    if (n < 0) {
      throw Error("negative count");
    }
    let avail = this.#w - this.#r;
    while (avail < n && avail < this.#buf.byteLength && !this.#eof) {
      try {
        await this.#fill();
      } catch (err) {
        if (err instanceof PartialReadError) {
          err.partial = this.#buf.subarray(this.#r, this.#w);
        }
        throw err;
      }
      avail = this.#w - this.#r;
    }
    if (avail === 0 && this.#eof) {
      return null;
    } else if (avail < n && this.#eof) {
      return this.#buf.subarray(this.#r, this.#r + avail);
    } else if (avail < n) {
      throw new BufferFullError(this.#buf.subarray(this.#r, this.#w));
    }
    return this.#buf.subarray(this.#r, this.#r + n);
  }
};

// deno:https://deno.land/std@0.214.0/io/buf_writer.ts
var DEFAULT_BUF_SIZE2 = 4096;
var AbstractBufBase = class {
  buf;
  usedBufferBytes = 0;
  err = null;
  constructor(buf) {
    this.buf = buf;
  }
  /** Size returns the size of the underlying buffer in bytes. */
  size() {
    return this.buf.byteLength;
  }
  /** Returns how many bytes are unused in the buffer. */
  available() {
    return this.buf.byteLength - this.usedBufferBytes;
  }
  /** buffered returns the number of bytes that have been written into the
   * current buffer.
   */
  buffered() {
    return this.usedBufferBytes;
  }
};
var BufWriter = class _BufWriter extends AbstractBufBase {
  #writer;
  /** return new BufWriter unless writer is BufWriter */
  static create(writer, size = DEFAULT_BUF_SIZE2) {
    return writer instanceof _BufWriter ? writer : new _BufWriter(writer, size);
  }
  constructor(writer, size = DEFAULT_BUF_SIZE2) {
    super(new Uint8Array(size <= 0 ? DEFAULT_BUF_SIZE2 : size));
    this.#writer = writer;
  }
  /** Discards any unflushed buffered data, clears any error, and
   * resets buffer to write its output to w.
   */
  reset(w) {
    this.err = null;
    this.usedBufferBytes = 0;
    this.#writer = w;
  }
  /** Flush writes any buffered data to the underlying io.Writer. */
  async flush() {
    if (this.err !== null) throw this.err;
    if (this.usedBufferBytes === 0) return;
    try {
      const p = this.buf.subarray(0, this.usedBufferBytes);
      let nwritten = 0;
      while (nwritten < p.length) {
        nwritten += await this.#writer.write(p.subarray(nwritten));
      }
    } catch (e) {
      if (e instanceof Error) {
        this.err = e;
      }
      throw e;
    }
    this.buf = new Uint8Array(this.buf.length);
    this.usedBufferBytes = 0;
  }
  /** Writes the contents of `data` into the buffer. If the contents won't fully
   * fit into the buffer, those bytes that are copied into the buffer will be flushed
   * to the writer and the remaining bytes are then copied into the now empty buffer.
   *
   * @return the number of bytes written to the buffer.
   */
  async write(data) {
    if (this.err !== null) throw this.err;
    if (data.length === 0) return 0;
    let totalBytesWritten = 0;
    let numBytesWritten = 0;
    while (data.byteLength > this.available()) {
      if (this.buffered() === 0) {
        try {
          numBytesWritten = await this.#writer.write(data);
        } catch (e) {
          if (e instanceof Error) {
            this.err = e;
          }
          throw e;
        }
      } else {
        numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
        this.usedBufferBytes += numBytesWritten;
        await this.flush();
      }
      totalBytesWritten += numBytesWritten;
      data = data.subarray(numBytesWritten);
    }
    numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
    this.usedBufferBytes += numBytesWritten;
    totalBytesWritten += numBytesWritten;
    return totalBytesWritten;
  }
};

// deno:https://deno.land/std@0.214.0/crypto/_wasm/lib/deno_std_wasm_crypto.generated.mjs
var wasm;
var heap = new Array(128).fill(void 0);
heap.push(void 0, null, true, false);
function getObject(idx) {
  return heap[idx];
}
var heap_next = heap.length;
function dropObject(idx) {
  if (idx < 132) return;
  heap[idx] = heap_next;
  heap_next = idx;
}
function takeObject(idx) {
  const ret = getObject(idx);
  dropObject(idx);
  return ret;
}
function addHeapObject(obj) {
  if (heap_next === heap.length) heap.push(heap.length + 1);
  const idx = heap_next;
  heap_next = heap[idx];
  heap[idx] = obj;
  return idx;
}
var cachedTextDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", {
  ignoreBOM: true,
  fatal: true
}) : {
  decode: () => {
    throw Error("TextDecoder not available");
  }
};
if (typeof TextDecoder !== "undefined") cachedTextDecoder.decode();
var cachedUint8Memory0 = null;
function getUint8Memory0() {
  if (cachedUint8Memory0 === null || cachedUint8Memory0.byteLength === 0) {
    cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8Memory0;
}
function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}
var WASM_VECTOR_LEN = 0;
var cachedTextEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder("utf-8") : {
  encode: () => {
    throw Error("TextEncoder not available");
  }
};
var encodeString = function(arg, view) {
  return cachedTextEncoder.encodeInto(arg, view);
};
function passStringToWasm0(arg, malloc, realloc) {
  if (realloc === void 0) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr2 = malloc(buf.length, 1) >>> 0;
    getUint8Memory0().subarray(ptr2, ptr2 + buf.length).set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr2;
  }
  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;
  const mem = getUint8Memory0();
  let offset = 0;
  for (; offset < len; offset++) {
    const code2 = arg.charCodeAt(offset);
    if (code2 > 127) break;
    mem[ptr + offset] = code2;
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
    const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
    const ret = encodeString(arg, view);
    offset += ret.written;
  }
  WASM_VECTOR_LEN = offset;
  return ptr;
}
function isLikeNone(x) {
  return x === void 0 || x === null;
}
var cachedInt32Memory0 = null;
function getInt32Memory0() {
  if (cachedInt32Memory0 === null || cachedInt32Memory0.byteLength === 0) {
    cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
  }
  return cachedInt32Memory0;
}
function getArrayU8FromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return getUint8Memory0().subarray(ptr / 1, ptr / 1 + len);
}
function digest(algorithm, data, length) {
  try {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    const ptr0 = passStringToWasm0(algorithm, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.digest(retptr, ptr0, len0, addHeapObject(data), !isLikeNone(length), isLikeNone(length) ? 0 : length);
    var r0 = getInt32Memory0()[retptr / 4 + 0];
    var r1 = getInt32Memory0()[retptr / 4 + 1];
    var r2 = getInt32Memory0()[retptr / 4 + 2];
    var r3 = getInt32Memory0()[retptr / 4 + 3];
    if (r3) {
      throw takeObject(r2);
    }
    var v2 = getArrayU8FromWasm0(r0, r1).slice();
    wasm.__wbindgen_free(r0, r1 * 1, 1);
    return v2;
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}
var DigestContextFinalization = new FinalizationRegistry((ptr) => wasm.__wbg_digestcontext_free(ptr >>> 0));
var DigestContext = class _DigestContext {
  static __wrap(ptr) {
    ptr = ptr >>> 0;
    const obj = Object.create(_DigestContext.prototype);
    obj.__wbg_ptr = ptr;
    DigestContextFinalization.register(obj, obj.__wbg_ptr, obj);
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.__wbg_ptr;
    this.__wbg_ptr = 0;
    DigestContextFinalization.unregister(this);
    return ptr;
  }
  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_digestcontext_free(ptr);
  }
  /**
   * Creates a new context incrementally computing a digest using the given
   * hash algorithm.
   *
   * An error will be thrown if `algorithm` is not a supported hash algorithm.
   * @param {string} algorithm
   */
  constructor(algorithm) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(algorithm, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      const len0 = WASM_VECTOR_LEN;
      wasm.digestcontext_new(retptr, ptr0, len0);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      if (r2) {
        throw takeObject(r1);
      }
      this.__wbg_ptr = r0 >>> 0;
      return this;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * Update the digest's internal state with the additional input `data`.
   *
   * If the `data` array view is large, it will be split into subarrays (via
   * JavaScript bindings) which will be processed sequentially in order to
   * limit the amount of memory that needs to be allocated in the Wasm heap.
   * @param {Uint8Array} data
   */
  update(data) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.digestcontext_update(retptr, this.__wbg_ptr, addHeapObject(data));
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      if (r1) {
        throw takeObject(r0);
      }
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * Returns the digest of the input data so far. This may be called repeatedly
   * without side effects.
   *
   * `length` will usually be left `undefined` to use the default length for
   * the algorithm. For algorithms with variable-length output, it can be used
   * to specify a non-negative integer number of bytes.
   *
   * An error will be thrown if `algorithm` is not a supported hash algorithm or
   * `length` is not a supported length for the algorithm.
   * @param {number | undefined} [length]
   * @returns {Uint8Array}
   */
  digest(length) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.digestcontext_digest(retptr, this.__wbg_ptr, !isLikeNone(length), isLikeNone(length) ? 0 : length);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      var r3 = getInt32Memory0()[retptr / 4 + 3];
      if (r3) {
        throw takeObject(r2);
      }
      var v1 = getArrayU8FromWasm0(r0, r1).slice();
      wasm.__wbindgen_free(r0, r1 * 1, 1);
      return v1;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * Returns the digest of the input data so far, and resets this context to
   * its initial state, as though it has not yet been provided with any input
   * data. (It will still use the same algorithm.)
   *
   * `length` will usually be left `undefined` to use the default length for
   * the algorithm. For algorithms with variable-length output, it can be used
   * to specify a non-negative integer number of bytes.
   *
   * An error will be thrown if `algorithm` is not a supported hash algorithm or
   * `length` is not a supported length for the algorithm.
   * @param {number | undefined} [length]
   * @returns {Uint8Array}
   */
  digestAndReset(length) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.digestcontext_digestAndReset(retptr, this.__wbg_ptr, !isLikeNone(length), isLikeNone(length) ? 0 : length);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      var r3 = getInt32Memory0()[retptr / 4 + 3];
      if (r3) {
        throw takeObject(r2);
      }
      var v1 = getArrayU8FromWasm0(r0, r1).slice();
      wasm.__wbindgen_free(r0, r1 * 1, 1);
      return v1;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * Returns the digest of the input data so far, and then drops the context
   * from memory on the Wasm side. This context must no longer be used, and any
   * further method calls will result in null pointer errors being thrown.
   * https://github.com/rustwasm/wasm-bindgen/blob/bf39cfd8/crates/backend/src/codegen.rs#L186
   *
   * `length` will usually be left `undefined` to use the default length for
   * the algorithm. For algorithms with variable-length output, it can be used
   * to specify a non-negative integer number of bytes.
   *
   * An error will be thrown if `algorithm` is not a supported hash algorithm or
   * `length` is not a supported length for the algorithm.
   * @param {number | undefined} [length]
   * @returns {Uint8Array}
   */
  digestAndDrop(length) {
    try {
      const ptr = this.__destroy_into_raw();
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.digestcontext_digestAndDrop(retptr, ptr, !isLikeNone(length), isLikeNone(length) ? 0 : length);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      var r3 = getInt32Memory0()[retptr / 4 + 3];
      if (r3) {
        throw takeObject(r2);
      }
      var v1 = getArrayU8FromWasm0(r0, r1).slice();
      wasm.__wbindgen_free(r0, r1 * 1, 1);
      return v1;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * Resets this context to its initial state, as though it has not yet been
   * provided with any input data. (It will still use the same algorithm.)
   */
  reset() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.digestcontext_reset(retptr, this.__wbg_ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      if (r1) {
        throw takeObject(r0);
      }
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  /**
   * Returns a new `DigestContext` that is a copy of this one, i.e., using the
   * same algorithm and with a copy of the same internal state.
   *
   * This may be a more efficient option for computing multiple digests that
   * start with a common prefix.
   * @returns {DigestContext}
   */
  clone() {
    const ret = wasm.digestcontext_clone(this.__wbg_ptr);
    return _DigestContext.__wrap(ret);
  }
};
var imports = {
  __wbindgen_placeholder__: {
    __wbg_new_d331494ab60a8491: function(arg0, arg1) {
      const ret = new TypeError(getStringFromWasm0(arg0, arg1));
      return addHeapObject(ret);
    },
    __wbindgen_object_drop_ref: function(arg0) {
      takeObject(arg0);
    },
    __wbg_byteLength_a8d894d93425b2e0: function(arg0) {
      const ret = getObject(arg0).byteLength;
      return ret;
    },
    __wbg_byteOffset_89d0a5265d5bde53: function(arg0) {
      const ret = getObject(arg0).byteOffset;
      return ret;
    },
    __wbg_buffer_3da2aecfd9814cd8: function(arg0) {
      const ret = getObject(arg0).buffer;
      return addHeapObject(ret);
    },
    __wbg_newwithbyteoffsetandlength_d695c7957788f922: function(arg0, arg1, arg2) {
      const ret = new Uint8Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
      return addHeapObject(ret);
    },
    __wbg_length_f0764416ba5bb237: function(arg0) {
      const ret = getObject(arg0).length;
      return ret;
    },
    __wbindgen_memory: function() {
      const ret = wasm.memory;
      return addHeapObject(ret);
    },
    __wbg_buffer_5d1b598a01b41a42: function(arg0) {
      const ret = getObject(arg0).buffer;
      return addHeapObject(ret);
    },
    __wbg_new_ace717933ad7117f: function(arg0) {
      const ret = new Uint8Array(getObject(arg0));
      return addHeapObject(ret);
    },
    __wbg_set_74906aa30864df5a: function(arg0, arg1, arg2) {
      getObject(arg0).set(getObject(arg1), arg2 >>> 0);
    },
    __wbindgen_throw: function(arg0, arg1) {
      throw new Error(getStringFromWasm0(arg0, arg1));
    }
  }
};
function instantiate() {
  return instantiateWithInstance().exports;
}
var instanceWithExports;
function instantiateWithInstance() {
  if (instanceWithExports == null) {
    const instance = instantiateInstance();
    wasm = instance.exports;
    cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
    cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
    instanceWithExports = {
      instance,
      exports: {
        digest,
        DigestContext
      }
    };
  }
  return instanceWithExports;
}
function instantiateInstance() {
  const wasmBytes = base64decode("AGFzbQEAAAABsQEZYAAAYAABf2ABfwBgAX8Bf2ACf38AYAJ/fwF/YAN/f38AYAN/f38Bf2AEf39/fwBgBH9/f38Bf2AFf39/f38AYAV/f39/fwF/YAZ/f39/f38AYAZ/f39/f38Bf2AHf39/f35/fwBgBX9/f35/AGAHf39/fn9/fwF/YAN/f34AYAV/f35/fwBgBX9/fX9/AGAFf398f38AYAJ/fgBgBH9+f38AYAR/fX9/AGAEf3x/fwACpAUMGF9fd2JpbmRnZW5fcGxhY2Vob2xkZXJfXxpfX3diZ19uZXdfZDMzMTQ5NGFiNjBhODQ5MQAFGF9fd2JpbmRnZW5fcGxhY2Vob2xkZXJfXxpfX3diaW5kZ2VuX29iamVjdF9kcm9wX3JlZgACGF9fd2JpbmRnZW5fcGxhY2Vob2xkZXJfXyFfX3diZ19ieXRlTGVuZ3RoX2E4ZDg5NGQ5MzQyNWIyZTAAAxhfX3diaW5kZ2VuX3BsYWNlaG9sZGVyX18hX193YmdfYnl0ZU9mZnNldF84OWQwYTUyNjVkNWJkZTUzAAMYX193YmluZGdlbl9wbGFjZWhvbGRlcl9fHV9fd2JnX2J1ZmZlcl8zZGEyYWVjZmQ5ODE0Y2Q4AAMYX193YmluZGdlbl9wbGFjZWhvbGRlcl9fMV9fd2JnX25ld3dpdGhieXRlb2Zmc2V0YW5kbGVuZ3RoX2Q2OTVjNzk1Nzc4OGY5MjIABxhfX3diaW5kZ2VuX3BsYWNlaG9sZGVyX18dX193YmdfbGVuZ3RoX2YwNzY0NDE2YmE1YmIyMzcAAxhfX3diaW5kZ2VuX3BsYWNlaG9sZGVyX18RX193YmluZGdlbl9tZW1vcnkAARhfX3diaW5kZ2VuX3BsYWNlaG9sZGVyX18dX193YmdfYnVmZmVyXzVkMWI1OThhMDFiNDFhNDIAAxhfX3diaW5kZ2VuX3BsYWNlaG9sZGVyX18aX193YmdfbmV3X2FjZTcxNzkzM2FkNzExN2YAAxhfX3diaW5kZ2VuX3BsYWNlaG9sZGVyX18aX193Ymdfc2V0Xzc0OTA2YWEzMDg2NGRmNWEABhhfX3diaW5kZ2VuX3BsYWNlaG9sZGVyX18QX193YmluZGdlbl90aHJvdwAEA4sBiQEGCAYIEQoEBgYEBg8DAwYGBBAEBwIEFQQEBAYJ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ACABQQhqKAIAIQUCQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQCABKAIEIgYOGwABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGgALQQAtAIDYQBpB0AEQGSIHRQ0dIAUpA0AhDyAEQcAAakHIAGogBUHIAGoQZyAEQcAAakEIaiAFQQhqKQMANwMAIARBwABqQRBqIAVBEGopAwA3AwAgBEHAAGpBGGogBUEYaikDADcDACAEQcAAakEgaiAFQSBqKQMANwMAIARBwABqQShqIAVBKGopAwA3AwAgBEHAAGpBMGogBUEwaikDADcDACAEQcAAakE4aiAFQThqKQMANwMAIARBwABqQcgBaiAFQcgBai0AADoAACAEIA83A4ABIAQgBSkDADcDQCAHIARBwABqQdABEJABGgwaC0EALQCA2EAaQdABEBkiB0UNHCAFKQNAIQ8gBEHAAGpByABqIAVByABqEGcgBEHAAGpBCGogBUEIaikDADcDACAEQcAAakEQaiAFQRBqKQMANwMAIARBwABqQRhqIAVBGGopAwA3AwAgBEHAAGpBIGogBUEgaikDADcDACAEQcAAakEoaiAFQShqKQMANwMAIARBwABqQTBqIAVBMGopAwA3AwAgBEHAAGpBOGogBUE4aikDADcDACAEQcAAakHIAWogBUHIAWotAAA6AAAgBCAPNwOAASAEIAUpAwA3A0AgByAEQcAAakHQARCQARoMGQtBAC0AgNhAGkHQARAZIgdFDRsgBSkDQCEPIARBwABqQcgAaiAFQcgAahBnIARBwABqQQhqIAVBCGopAwA3AwAgBEHAAGpBEGogBUEQaikDADcDACAEQcAAakEYaiAFQRhqKQMANwMAIARBwABqQSBqIAVBIGopAwA3AwAgBEHAAGpBKGogBUEoaikDADcDACAEQcAAakEwaiAFQTBqKQMANwMAIARBwABqQThqIAVBOGopAwA3AwAgBEHAAGpByAFqIAVByAFqLQAAOgAAIAQgDzcDgAEgBCAFKQMANwNAIAcgBEHAAGpB0AEQkAEaDBgLQQAtAIDYQBpB0AEQGSIHRQ0aIAUpA0AhDyAEQcAAakHIAGogBUHIAGoQZyAEQcAAakEIaiAFQQhqKQMANwMAIARBwABqQRBqIAVBEGopAwA3AwAgBEHAAGpBGGogBUEYaikDADcDACAEQcAAakEgaiAFQSBqKQMANwMAIARBwABqQShqIAVBKGopAwA3AwAgBEHAAGpBMGogBUEwaikDADcDACAEQcAAakE4aiAFQThqKQMANwMAIARBwABqQcgBaiAFQcgBai0AADoAACAEIA83A4ABIAQgBSkDADcDQCAHIARBwABqQdABEJABGgwXC0EALQCA2EAaQdABEBkiB0UNGSAFKQNAIQ8gBEHAAGpByABqIAVByABqEGcgBEHAAGpBCGogBUEIaikDADcDACAEQcAAakEQaiAFQRBqKQMANwMAIARBwABqQRhqIAVBGGopAwA3AwAgBEHAAGpBIGogBUEgaikDADcDACAEQcAAakEoaiAFQShqKQMANwMAIARBwABqQTBqIAVBMGopAwA3AwAgBEHAAGpBOGogBUE4aikDADcDACAEQcAAakHIAWogBUHIAWotAAA6AAAgBCAPNwOAASAEIAUpAwA3A0AgByAEQcAAakHQARCQARoMFgtBAC0AgNhAGkHQARAZIgdFDRggBSkDQCEPIARBwABqQcgAaiAFQcgAahBnIARBwABqQQhqIAVBCGopAwA3AwAgBEHAAGpBEGogBUEQaikDADcDACAEQcAAakEYaiAFQRhqKQMANwMAIARBwABqQSBqIAVBIGopAwA3AwAgBEHAAGpBKGogBUEoaikDADcDACAEQcAAakEwaiAFQTBqKQMANwMAIARBwABqQThqIAVBOGopAwA3AwAgBEHAAGpByAFqIAVByAFqLQAAOgAAIAQgDzcDgAEgBCAFKQMANwNAIAcgBEHAAGpB0AEQkAEaDBULQQAtAIDYQBpB8AAQGSIHRQ0XIAUpAyAhDyAEQcAAakEoaiAFQShqEFUgBEHAAGpBCGogBUEIaikDADcDACAEQcAAakEQaiAFQRBqKQMANwMAIARBwABqQRhqIAVBGGopAwA3AwAgBEHAAGpB6ABqIAVB6ABqLQAAOgAAIAQgDzcDYCAEIAUpAwA3A0AgByAEQcAAakHwABCQARoMFAtBACEIQQAtAIDYQBpB+A4QGSIHRQ0WIARBkCBqQdgAaiAFQfgAaikDADcDACAEQZAgakHQAGogBUHwAGopAwA3AwAgBEGQIGpByABqIAVB6ABqKQMANwMAIARBkCBqQQhqIAVBKGopAwA3AwAgBEGQIGpBEGogBUEwaikDADcDACAEQZAgakEYaiAFQThqKQMANwMAIARBkCBqQSBqIAVBwABqKQMANwMAIARBkCBqQShqIAVByABqKQMANwMAIARBkCBqQTBqIAVB0ABqKQMANwMAIARBkCBqQThqIAVB2ABqKQMANwMAIAQgBUHgAGopAwA3A9AgIAQgBSkDIDcDkCAgBUGAAWopAwAhDyAFQYoBai0AACEJIAVBiQFqLQAAIQogBUGIAWotAAAhCwJAIAVB8A5qKAIAIgxFDQAgBUGQAWoiDSAMQQV0aiEOQQEhCCAEQcAPaiEMA0AgDCANKQAANwAAIAxBGGogDUEYaikAADcAACAMQRBqIA1BEGopAAA3AAAgDEEIaiANQQhqKQAANwAAIA1BIGoiDSAORg0BIAhBN0YNGSAMQSBqIA0pAAA3AAAgDEE4aiANQRhqKQAANwAAIAxBMGogDUEQaikAADcAACAMQShqIA1BCGopAAA3AAAgDEHAAGohDCAIQQJqIQggDUEgaiINIA5HDQALIAhBf2ohCAsgBCAINgKgHSAEQcAAakEFaiAEQcAPakHkDRCQARogBEHAD2pBCGogBUEIaikDADcDACAEQcAPakEQaiAFQRBqKQMANwMAIARBwA9qQRhqIAVBGGopAwA3AwAgBCAFKQMANwPADyAEQcAPakEgaiAEQZAgakHgABCQARogByAEQcAPakGAARCQASIFIAk6AIoBIAUgCjoAiQEgBSALOgCIASAFIA83A4ABIAVBiwFqIARBwABqQekNEJABGgwTC0EALQCA2EAaQegCEBkiB0UNFSAFKALIASEMIARBwABqQdABaiAFQdABahBoIAVB4AJqLQAAIQ0gBEHAAGogBUHIARCQARogBEHAAGpB4AJqIA06AAAgBCAMNgKIAiAHIARBwABqQegCEJABGgwSC0EALQCA2EAaQeACEBkiB0UNFCAFKALIASEMIARBwABqQdABaiAFQdABahBpIAVB2AJqLQAAIQ0gBEHAAGogBUHIARCQARogBEHAAGpB2AJqIA06AAAgBCAMNgKIAiAHIARBwABqQeACEJABGgwRC0EALQCA2EAaQcACEBkiB0UNEyAFKALIASEMIARBwABqQdABaiAFQdABahBqIAVBuAJqLQAAIQ0g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QoABfDcDQCABIAVCABAQAkAgAyAGayIDRQ0AIAIgBmohAgxnC0G4ksAAIQNBACEGDGcLIAFByABqIQUgA0GAASABQcgBai0AACIAayIGTQ0aIABFDWMgBSAAaiACIAYQkAEaIAEgASkDQEKAAXw3A0AgASAFQgAQEAJAIAMgBmsiA0UNACACIAZqIQIMZAtBuJLAACEDQQAhBgxkCyABQcgAaiEFIANBgAEgAUHIAWotAAAiAGsiBk0NGiAARQ1gIAUgAGogAiAGEJABGiABIAEpA0BCgAF8NwNAIAEgBUIAEBACQCADIAZrIgNFDQAgAiAGaiECDGELQbiSwAAhA0EAIQYMYQsgAUHIAGohBSADQYABIAFByAFqLQAAIgBrIgZNDRogAEUNXSAFIABqIAIgBhCQARogASABKQNAQoABfDcDQCABIAVCABAQAkAgAyAGayIDRQ0AIAIgBmohAgxeC0G4ksAAIQNBACEGDF4LIAFByABqIQUgA0GAASABQcgBai0AACIAayIGTQ0aIABFDVogBSAAaiACIAYQkAEaIAEgASkDQEKAAXw3A0AgASAFQgAQEAJAIAMgBmsiA0UNACACIAZqIQIMWwtBuJLAACEDQQAhBgxbCyABQShqIQUgA0HAACABQegAai0AACIAayIGTQ0aIABFDVcgBSAAaiACIAYQkAEaIAEgASkDIELAAHw3AyBBACEHIAEgBUEAEBMCQCADIAZrIgNFDQAgAiAGaiECDFgLQbiSwAAhAwxYCyABQSBqIQggAUGJAWotAABBBnQgAUGIAWotAABqIgBFDVUgCCACQYAIIABrIgAgAyAAIANJGyIGEC8hBSADIAZrIgNFDWQgBEG4AWoiCSABQegAaiIAKQMANwMAIARBwAFqIgogAUHwAGoiBykDADcDACAEQcgBaiILIAFB+ABqIgwpAwA3AwAgBEHwAGpBCGoiDSAFQQhqKQMANwMAIARB8ABqQRBqIg4gBUEQaikDADcDACAEQfAAakEYaiIPIAVBGGopAwA3AwAgBEHwAGpBIGoiECAFQSBqKQMANwMAIARB8ABqQShqIhEgBUEoaikDADcDACAEQfAAakEwaiISIAVBMGopAwA3AwAgBEHwAGpBOGoiEyAFQThqKQMANwMAIAQgBSkDADcDcCAEIAFB4ABqIhQpAwA3A7ABIAFBigFqLQAAIRUgAUGAAWopAwAhPSABLQCJASEWIAQgAS0AiAEiFzoA2AEgBCA9NwPQASAEIBUgFkVyQQJyIhU6ANkBIARBGGoiFiAMKQIANwMAIARBEGoiDCAHKQIANwMAIARBCGoiByAAKQIANwMAIAQgFCkCADcDACAEIARB8ABqIBcgPSAVEBcgBEEfai0AACEUIARBHmotAAAhFSAEQR1qLQAAIRcgBEEbai0AACEYIARBGmotAAAhGSAEQRlqLQAAIRogFi0AACEWIARBF2otAAAhGyAEQRZqLQAAIRwgBEEVai0AACEdIARBE2otAAAhHiAEQRJqLQAAIR8gBEERai0AACEgIAwtAAAhDCAEQQ9qLQAAISEgBEEOai0AACEiIARBDWotAAAhIyAEQQtqLQAAISQgBEEKai0AACElIARBCWotAAAhJiAHLQAAIScgBC0AHCEoIAQtABQhKSAELQAMISogBC0AByErIAQtAAYhLCAELQAFIS0gBC0ABCEuIAQtAAMhLyAELQACITAgBC0AASExIAQtAAAhMiABID0QIiABQfAOaigCACIHQTdPDRogASAHQQV0aiIAQZMBaiAvOgAAIABBkgFqIDA6AAAgAEGRAWogMToAACAAQZABaiAyOgAAIABBrwFqIBQ6AAAgAEGuAWogFToAACAAQa0BaiAXOgAAIABBrAFqICg6AAAgAEGrAWogGDoAACAAQaoBaiAZOgAAIABBqQFqIBo6AAAgAEGoAWogFjoAACAAQacBaiAbOgAAIABBpgFqIBw6AAAgAEGlAWogHToAACAAQaQBaiApOgAAIABBowFqIB46AAAgAEGiAWogHzoAACAAQaEBaiAgOgAAIABBoAFqIAw6AAAgAEGfAWogIToAACAAQZ4BaiAiOgAAIABBnQFqICM6AAAgAEGcAWogKjoAACAAQZsBaiAkOgAAIABBmgFqICU6AAAgAEGZAWogJjoAACAAQZgBaiAnOgAAIABBlwFqICs6AAAgAEGWAWogLDoAACAAQZUBaiAtOgAAIABBlAFqIC46AAAgASAHQQFqNgLwDiANQgA3AwAgDkIANwMAIA9CADcDACAQQgA3AwAgEUIANwMAIBJCADcDACATQgA3AwAgCSABQQhqKQMANwMAIAogAUEQaikDADcDACALIAFBGGopAwA3AwAgBEIANwNwIAQgASkDADcDsAEgASkDgAEhPSAFIARB8ABqQeAAEJABGiABQQA7AYgBIAEgPUIBfDcDgAEgAiAGaiECDFULIAQgATYCcCABQdABaiEFIANBkAEgAUHgAmotAAAiAGsiBkkNGiAADRsMUwsgBCABNgJwIAFB0AFqIQUgA0GIASABQdgCai0AACIAayIGSQ0bIAANHAxRCyAEIAE2AnAgAUHQAWohBSADQegAIAFBuAJqLQAAIgBrIgZJDRwgAA0dDE8LIAQgATYCcCABQdABaiEFIANByAAgAUGYAmotAAAiAGsiBkkNHSAADR4MTQsgAUEYaiEFIANBwAAgAUHYAGotAAAiAGsiBkkNHiAADR8MSwsgBCABNgJwIAFBGGohBSADQcAAIAFB2ABqLQAAIgBrIgZJDR8gAA0gDEkLIAFBIGohBiADQcAAIAFB4ABqLQAAIgBrIgVJDSAgAA0hDEcLIAFBIGohBSADQcAAIAFB4ABqLQAAIgBrIgZJDSEgAA0iDEULIAQgATYCcCABQdABaiEFIANBkAEgAUHgAmotAAAiAGsiBkkNIiAADSMMQwsgBCABNgJwIAFB0AFqIQUgA0GIASABQdgCai0AACIAayIGSQ0jIAANJAxBCyAEIAE2AnAgAUHQAWohBSADQegAIAFBuAJqLQAAIgBrIgZJDSQgAA0lDD8LIAQgATYCcCABQdABaiEFIANByAAgAUGYAmotAAAiAGsiBkkNJSAADSYMPQsgAUEoaiEFIANBwAAgAUHoAGotAAAiAGsiBkkNJiAADScMOwsgAUEoaiEFIANBwAAgAUHoAGotAAAiAGsiBkkNJyAADSgMOQsgAUHQAGohBSADQYABIAFB0AFqLQAAIgBrIgZJDSggAA0pDDcLIAFB0ABqIQUgA0GAASABQdABai0AACIAayIGSQ0pIAANKgw1CyAEIAE2AnAgAUHQAWohBSADQagBIAFB+AJqLQAAIgBrIgZJDSogAA0rDDMLIAQgATYCcCABQdABaiEFIANBiAEgAUHYAmotAAAiAGsiBkkNKyAADSwMMQsgAUEgaiEGIANBwAAgAUHgAGotAAAiAGsiBUkNLCAADS0MLgsgBSAAaiACIAMQkAEaIAEgACADajoAyAEMUAsgBSAAaiACIAMQkAEaIAEgACADajoAyAEMTwsgBSAAaiACIAMQkAEaIAEgACADajoAyAEMTgsgBSAAaiACIAMQkAEaIAEgACADajoAyAEMTQsgBSAAaiACIAMQkAEaIAEgACADajoAyAEMTAsgBSAAaiACIAMQkAEaIAEgACADajoAyAEMSwsgBSAAaiACIAMQkAEaIAEgACADajoAaAxKCyAEQfAAakEdaiAXOgAAIARB8ABqQRlqIBo6AAAgBEHwAGpBFWogHToAACAEQfAAakERaiAgOgAAIARB8ABqQQ1qICM6AAAgBEHwAGpBCWogJjoAACAEQfUAaiAtOgAAIARB8ABqQR5qIBU6AAAgBEHwAGpBGmogGToAACAEQfAAakEWaiAcOgAAIARB8ABqQRJqIB86AAAgBEHwAGpBDmogIjoAACAEQfAAakEKaiAlOgAAIARB9gBqICw6AAAgBEHwAGpBH2ogFDoAACAEQfAAakEbaiAYOgAAIARB8ABqQRdqIBs6AAAgBEHwAGpBE2ogHjoAACAEQfAAakEPaiAhOgAAIARB8ABqQQtqICQ6AAAgBEH3AGogKzoAACAEICg6AIwBIAQgFjoAiAEgBCApOgCEASAEIAw6AIABIAQgKjoAfCAEICc6AHggBCAuOgB0IAQgMjoAcCAEIDE6AHEgBCAwOgByIAQgLzoAc0GMksAAIARB8ABqQeyGwABBxIXAABBfAAsgBSAAaiACIAMQkAEaIAEgACADajoA4AIMSAsgBSAAaiACIAYQkAEaIARB8ABqIAVBARA7IAIgBmohAiADIAZrIQMMNwsgBSAAaiACIAMQkAEaIAEgACADajoA2AIMRgsgBSAAaiACIAYQkAEaIARB8ABqIAVBARBCIAIgBmohAiADIAZrIQMMNAsgBSAAaiACIAMQkAEaIAEgACADajoAuAIMRAsgBSAAaiACIAYQkAEaIARB8ABqIAVBARBSIAIgBmohAiADIAZrIQMMMQsgBSAAaiACIAMQkAEaIAEgACADajoAmAIMQgsgBSAAaiACIAYQkAEaIARB8ABqIAVBARBYIAIgBmohAiADIAZrIQMMLgsgBSAAaiACIAMQkAEaIAEgACADajoAWAxACyAFIABqIAIgBhCQARogASABKQMQQgF8NwMQIAEgBRAjIAMgBmshAyACIAZqIQIMKwsgBSAAaiACIAMQkAEaIAEgACADajoAWAw+CyAFIABqIAIgBhCQARogBEHwAGogBUEBEBsgAiAGaiECIAMgBmshAwwoCyAGIABqIAIgAxCQARogASAAIANqOgBgDDwLIAYgAGogAiAFEJABGiABIAEpAwBCAXw3AwAgAUEIaiAGEBIgAyAFayEDIAIgBWohAgwlCyAFIABqIAIgAxCQARogASAAIANqOgBgDDoLIAUgAGogAiAGEJABGiABIAEpAwBCAXw3AwAgAUEIaiAFQQEQFCACIAZqIQIgAyAGayEDDCILIAUgAGogAiADEJABGiABIAAgA2o6AOACDDgLIAUgAGogAiAGEJABGiAEQfAAaiAFQQEQOyACIAZqIQIgAyAGayEDDB8LIAUgAGogAiADEJABGiABIAAgA2o6ANgCDDYLIAUgAGogAiAGEJABGiAEQfAAaiAFQQEQQiACIAZqIQIgAyAGayEDDBwLIAUgAGogAiADEJABGiABIAAgA2o6ALgCDDQLIAUgAGogAiAGEJABGiAEQfAAaiAFQQEQUiACIAZqIQIgAyAGayEDDBkLIAUgAGogAiADEJABGiABIAAgA2o6AJgCDDILIAUgAGogAiAGEJABGiAEQfAAaiAFQQEQWCACIAZqIQIgAyAGayEDDBYLIAUgAGogAiADEJABGiABIAAgA2o6AGgMMAsgBSAAaiACIAYQkAEaIAEgASkDIEIBfDcDICABIAVBARAOIAIgBmohAiADIAZrIQMMEwsgBSAAaiACIAMQkAEaIAEgACADajoAaAwuCyAFIABqIAIgBhCQARogASABKQMgQgF8NwMgIAEgBUEBEA4gAiAGaiECIAMgBmshAwwQCyAFIABqIAIgAxCQARogASAAIANqOgDQAQwsCyAFIABqIAIgBhCQARogASABKQNAQgF8Ij03A0AgAUHIAGoiACAAKQMAID1QrXw3AwAgASAFQQEQDCACIAZqIQIgAyAGayEDDA0LIAUgAGogAiADEJABGiABIAAgA2o6ANABDCoLIAUgAGogAiAGEJABGiABIAEpA0BCAXwiPTcDQCABQcgAaiIAIAApAwAgPVCtfDcDACABIAVBARAMIAIgBmohAiADIAZrIQMMCgsgBSAAaiACIAMQkAEaIAEgACADajoA+AIMKAsgBSAAaiACIAYQkAEaIARB8ABqIAVBARAzIAIgBmohAiADIAZrIQMMBwsgBSAAaiACIAMQkAEaIAEgACADajoA2AIMJgsgBSAAaiACIAYQkAEaIARB8ABqIAVBARBCIAIgBmohAiADIAZrIQMMBAsgBiAAaiACIAMQkAEaIAAgA2ohBwwCCyAGIABqIAIgBRCQARogASABKQMAQgF8NwMAIAFBCGogBhAVIAMgBWshAyACIAVqIQILIANBP3EhByACIANBQHEiAGohDAJAIANBwABJDQAgASABKQMAIANBBnatfDcDACABQQhqIQUDQCAFIAIQFSACQcAAaiECIABBQGoiAA0ACwsgBiAMIAcQkAEaCyABIAc6AGAMIQsgAyADQYgBbiIHQYgBbCIGayEAAkAgA0GIAUkNACAEQfAAaiACIAcQQgsCQCAAQYkBTw0AIAUgAiAGaiAAEJABGiABIAA6ANgCDCELIABBiAFBgIDAABBgAAsgAyADQagBbiIHQagBbCIGayEAAkAgA0GoAUkNACAEQfAAaiACIAcQMwsCQCAAQakBTw0AIAUgAiAGaiAAEJABGiABIAA6APgCDCALIABBqAFBgIDAABBgAAsgA0H/AHEhACACIANBgH9xaiEGAkAgA0GAAUkNACABIAEpA0AiPSADQQd2IgOtfCI+NwNAIAFByABqIgcgBykDACA+ID1UrXw3AwAgASACIAMQDAsgBSAGIAAQkAEaIAEgADoA0AEMHgsgA0H/AHEhACACIANBgH9xaiEGAkAgA0GAAUkNACABIAEpA0AiPSADQQd2IgOtfCI+NwNAIAFByABqIgcgBykDACA+ID1UrXw3AwAgASACIAMQDAsgBSAGIAAQkAEaIAEgADoA0AEMHQsgA0E/cSEAIAIgA0FAcWohBgJAIANBwABJDQAgASABKQMgIANBBnYiA618NwMgIAEgAiADEA4LIAUgBiAAEJABGiABIAA6AGgMHAsgA0E/cSEAIAIgA0FAcWohBgJAIANBwABJDQAgASABKQMgIANBBnYiA618NwMgIAEgAiADEA4LIAUgBiAAEJABGiABIAA6AGgMGwsgAyADQcgAbiIHQcgAbCIGayEAAkAgA0HIAEkNACAEQfAAaiACIAcQWAsCQCAAQckATw0AIAUgAiAGaiAAEJABGiABIAA6AJgCDBsLIABByABBgIDAABBgAAsgAyADQegAbiIHQegAbCIGayEAAkAgA0HoAEkNACAEQfAAaiACIAcQUgsCQCAAQekATw0AIAUgAiAGaiAAEJABGiABIAA6ALgCDBoLIABB6ABBgIDAABBgAAsgAyADQYgBbiIHQYgBbCIGayEAAkAgA0GIAUkNACAEQfAAaiACIAcQQgsCQCAAQYkBTw0AIAUgAiAGaiAAEJABGiABIAA6ANgCDBkLIABBiAFBgIDAABBgAAsgAyADQZABbiIHQZABbCIGayEAAkAgA0GQAUkNACAEQfAAaiACIAcQOwsCQCAAQZEBTw0AIAUgAiAGaiAAEJABGiABIAA6AOACDBgLIABBkAFBgIDAABBgAAsgA0E/cSEAIAIgA0FAcWohBgJAIANBwABJDQAgASABKQMAIANBBnYiA618NwMAIAFBCGogAiADEBQLIAUgBiAAEJABGiABIAA6AGAMFgsgA0E/cSEHIAIgA0FAcSIAaiEMAkAgA0HAAEkNACABIAEpAwAgA0EGdq18NwMAIAFBCGohBQNAIAUgAhASIAJBwABqIQIgAEFAaiIADQALCyAGIAwgBxCQARogASAHOgBgDBULIANBP3EhACACIANBQHFqIQYCQCADQcAASQ0AIARB8ABqIAIgA0EGdhAbCyAFIAYgABCQARogASAAOgBYDBQLIANBP3EhBiACIANBQHEiAGohBwJAIANBwABJDQAgASABKQMQIANBBnatfDcDEANAIAEgAhAjIAJBwABqIQIgAEFAaiIADQALCyAFIAcgBhCQARogASAGOgBYDBMLIAMgA0HIAG4iB0HIAGwiBmshAAJAIANByABJDQAgBEHwAGogAiAHEFgLAkAgAEHJAE8NACAFIAIgBmogABCQARogASAAOgCYAgwTCyAAQcgAQYCAwAAQYAALIAMgA0HoAG4iB0HoAGwiBmshAAJAIANB6ABJDQAgBEHwAGogAiAHEFILAkAgAEHpAE8NACAFIAIgBmogABCQARogASAAOgC4AgwSCyAAQegAQYCAwAAQYAALIAMgA0GIAW4iB0GIAWwiBmshAAJAIANBiAFJDQAgBEHwAGogAiAHEEILAkAgAEGJAU8NACAFIAIgBmogABCQARogASAAOgDYAgwRCyAAQYgBQYCAwAAQYAALIAMgA0GQAW4iB0GQAWwiBmshAAJAIANBkAFJDQAgBEHwAGogAiAHEDsLAkAgAEGRAU8NACAFIAIgBmogABCQARogASAAOgDgAgwQCyAAQZABQYCAwAAQYAALAkACQAJAAkACQAJAAkACQAJAIANBgQhJDQAgAUGQAWohFiABQYABaikDACE+IARBwABqIRUgBEHwAGpBwABqIQwgBEEgaiEUIARB4AFqQR9qIQ0gBEHgAWpBHmohDiAEQeABakEdaiEPIARB4AFqQRtqIRAgBEHgAWpBGmohESAEQeABakEZaiESIARB4AFqQRdqIRMgBEHgAWpBFmohMyAEQeABakEVaiE0IARB4AFqQRNqITUgBEHgAWpBEmohNiAEQeABakERaiE3IARB4AFqQQ9qITggBEHgAWpBDmohOSAEQeABakENaiE6IARB4AFqQQtqITsgBEHgAWpBCWohPANAID5CCoYhPUF/IANBAXZndkEBaiEFA0AgBSIAQQF2IQUgPSAAQX9qrYNCAFINAAsgAEEKdq0hPQJAAkAgAEGBCEkNACADIABJDQUgAS0AigEhByAEQfAAakE4aiIXQgA3AwAgBEHwAGpBMGoiGEIANwMAIARB8ABqQShqIhlCADcDACAEQfAAakEgaiIaQgA3AwAgBEHwAGpBGGoiG0IANwMAIARB8ABqQRBqIhxCADcDACAEQfAAakEIaiIdQgA3AwAgBEIANwNwIAIgACABID4gByAEQfAAakHAABAdIQUgBEHgAWpBGGpCADcDACAEQeABakEQakIANwMAIARB4AFqQQhqQgA3AwAgBEIANwPgAQJAIAVBA0kNAANAIAVBBXQiBUHBAE8NCCAEQfAAaiAFIAEgByAEQeABakEgECwiBUEFdCIGQcEATw0JIAZBIU8NCiAEQfAAaiAEQeABaiAGEJABGiAFQQJLDQALCyAEQThqIBcpAwA3AwAgBEEwaiAYKQMANwMAIARBKGogGSkDADcDACAUIBopAwA3AwAgBEEYaiIHIBspAwA3AwAgBEEQaiIXIBwpAwA3AwAgBEEIaiIYIB0pAwA3AwAgBCAEKQNwNwMAIAEgASkDgAEQIiABKALwDiIGQTdPDQkgFiAGQQV0aiIFIAQpAwA3AAAgBUEYaiAHKQMANwAAIAVBEGogFykDADcAACAFQQhqIBgpAwA3AAAgASAGQQFqNgLwDiABIAEpA4ABID1CAYh8ECIgASgC8A4iBkE3Tw0KIBYgBkEFdGoiBSAUKQAANwAAIAVBGGogFEEYaikAADcAACAFQRBqIBRBEGopAAA3AAAgBUEIaiAUQQhqKQAANwAAIAEgBkEBajYC8A4MAQsgBEHwAGpBCGpCADcDACAEQfAAakEQakIANwMAIARB8ABqQRhqQgA3AwAgBEHwAGpBIGpCADcDACAEQfAAakEoakIANwMAIARB8ABqQTBqQgA3AwAgBEHwAGpBOGpCADcDACAMIAEpAwA3AwAgDEEIaiIGIAFBCGopAwA3AwAgDEEQaiIHIAFBEGopAwA3AwAgDEEYaiIXIAFBGGopAwA3AwAgBEIANwNwIARBADsB2AEgBCA+NwPQASAEIAEtAIoBOgDaASAEQfAAaiACIAAQLyEFIBUgDCkDADcDACAVQQhqIAYpAwA3AwAgFUEQaiAHKQMANwMAIBVBGGogFykDADcDACAEQQhqIAVBCGopAwA3AwAgBEEQaiAFQRBqKQMANwMAIARBGGogBUEYaikDADcDACAUIAVBIGopAwA3AwAgBEEoaiAFQShqKQMANwMAIARBMGogBUEwaikDADcDACAEQThqIAVBOGopAwA3AwAgBCAFKQMANwMAIAQtANoBIQUgBC0A2QEhGCAEKQPQASE+IAQgBC0A2AEiGToAaCAEID43A2AgBCAFIBhFckECciIFOgBpIARB4AFqQRhqIhggFykCADcDACAEQeABakEQaiIXIAcpAgA3AwAgBEHgAWpBCGoiByAGKQIANwMAIAQgDCkCADcD4AEgBEHgAWogBCAZID4gBRAXIA0tAAAhGSAOLQAAIRogDy0AACEbIBAtAAAhHCARLQAAIR0gEi0AACEeIBgtAAAhGCATLQAAIR8gMy0AACEgIDQtAAAhISA1LQAAISIgNi0AACEjIDctAAAhJCAXLQAAIRcgOC0AACElIDktAAAhJiA6LQAAIScgOy0AACEoIARB4AFqQQpqLQAAISkgPC0AACEqIActAAAhByAELQD8ASErIAQtAPQBISwgBC0A7AEhLSAELQDnASEuIAQtAOYBIS8gBC0A5QEhMCAELQDkASExIAQtAOMBITIgBC0A4gEhCSAELQDhASEKIAQtAOABIQsgASABKQOAARAiIAEoAvAOIgZBN08NCiAWIAZBBXRqIgUgCToAAiAFIAo6AAEgBSALOgAAIAVBA2ogMjoAACAFICs6ABwg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dyICICAgGnNBGHciFCAcaiIVaiIJIA9zQRR3Ig9qIgtzNgIMIAAgBiAKIAxqIBUgHXNBGXciFWoiCmogCiANc0EQdyIGIBFqIg0gFXNBFHciFWoiCiAGc0EYdyIGIA1qIg0gByATIAhqIA4gBXNBGXciBWoiCGogCCAUc0EQdyIIIAFqIgEgBXNBFHciBWoiB3M2AgggACALIAJzQRh3IgIgCWoiDiAWczYCBCAAIAcgCHNBGHciCCABaiIBIApzNgIAIAAgASAFc0EZdyAGczYCHCAAIAQgEnNBGXcgAnM2AhggACANIBVzQRl3IAhzNgIUIAAgDiAPc0EZdyAQczYCEAuIIwILfwN+IwBBwBxrIgEkAAJAAkACQAJAIABFDQAgACgCACICQX9GDQEgACACQQFqNgIAIABBCGooAgAhAgJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAIABBBGooAgAiAw4bAAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaAAtBAC0AgNhAGkHQARAZIgRFDR0gAikDQCEMIAFByABqIAJByABqEGcgAUEIaiACQQhqKQMANwMAIAFBEGogAkEQaikDADcDACABQRhqIAJBGGopAwA3AwAgAUEgaiACQSBqKQMANwMAIAFBKGogAkEoaikDADcDACABQTBqIAJBMGopAwA3AwAgAUE4aiACQThqKQMANwMAIAFByAFqIAJByAFqLQAAOgAAIAEgDDcDQCABIAIpAwA3AwAgBCABQdABEJABGgwaC0EALQCA2EAaQdABEBkiBEUNHCACKQNAIQwgAUHIAGogAkHIAGoQZyABQQhqIAJBCGopAwA3AwAgAUEQaiACQRBqKQMANwMAIAFBGGogAkEYaikDADcDACABQSBqIAJBIGopAwA3AwAgAUEoaiACQShqKQMANwMAIAFBMGogAkEwaikDADcDACABQThqIAJBOGopAwA3AwAgAUHIAWogAkHIAWotAAA6AAAgASAMNwNAIAEgAikDADcDACAEIAFB0AEQkAEaDBkLQQAtAIDYQBpB0AEQGSIERQ0bIAIpA0AhDCABQcgAaiACQcgAahBnIAFBCGogAkEIaikDADcDACABQRBqIAJBEGopAwA3AwAgAUEYaiACQRhqKQMANwMAIAFBIGogAkEgaikDADcDACABQShqIAJBKGopAwA3AwAgAUEwaiACQTBqKQMANwMAIAFBOGogAkE4aikDADcDACABQcgBaiACQcgBai0AADoAACABIAw3A0AgASACKQMANwMAIAQgAUHQARCQARoMGAtBAC0AgNhAGkHQARAZIgRFDRogAikDQCEMIAFByABqIAJByABqEGcgAUEIaiACQQhqKQMANwMAIAFBEGogAkEQaikDADcDACABQRhqIAJBGGopAwA3AwAgAUEgaiACQSBqKQMANwMAIAFBKGogAkEoaikDADcDACABQTBqIAJBMGopAwA3AwAgAUE4aiACQThqKQMANwMAIAFByAFqIAJByAFqLQAAOgAAIAEgDDcDQCABIAIpAwA3AwAgBCABQdABEJABGgwXC0EALQCA2EAaQdABEBkiBEUNGSACKQNAIQwgAUHIAGogAkHIAGoQZyABQQhqIAJBCGopAwA3AwAgAUEQaiACQRBqKQMANwMAIAFBGGogAkEYaikDADcDACABQSBqIAJBIGopAwA3AwAgAUEoaiACQShqKQMANwMAIAFBMGogAkEwaikDADcDACABQThqIAJBOGopAwA3AwAgAUHIAWogAkHIAWotAAA6AAAgASAMNwNAIAEgAikDADcDACAEIAFB0AEQkAEaDBYLQQAtAIDYQBpB0AEQGSIERQ0YIAIpA0AhDCABQcgAaiACQcgAahBnIAFBCGogAkEIaikDADcDACABQRBqIAJBEGopAwA3AwAgAUEYaiACQRhqKQMANwMAIAFBIGogAkEgaikDADcDACABQShqIAJBKGopAwA3AwAgAUEwaiACQTBqKQMANwMAIAFBOGogAkE4aikDADcDACABQcgBaiACQcgBai0AADoAACABIAw3A0AgASACKQMANwMAIAQgAUHQARCQARoMFQtBAC0AgNhAGkHwABAZIgRFDRcgAikDICEMIAFBKGogAkEoahBVIAFBCGogAkEIaikDADcDACABQRBqIAJBEGopAwA3AwAgAUEYaiACQRhqKQMANwMAIAFB6ABqIAJB6ABqLQAAOgAAIAEgDDcDICABIAIpAwA3AwAgBCABQfAAEJABGgwUC0EAIQVBAC0AgNhAGkH4DhAZIgRFDRYgAUH4DWpB2ABqIAJB+ABqKQMANwMAIAFB+A1qQdAAaiACQfAAaikDADcDACABQfgNakHIAGogAkHoAGopAwA3AwAgAUH4DWpBCGogAkEoaikDADcDACABQfgNakEQaiACQTBqKQMANwMAIAFB+A1qQRhqIAJBOGopAwA3AwAgAUH4DWpBIGogAkHAAGopAwA3AwAgAUH4DWpBKGogAkHIAGopAwA3AwAgAUH4DWpBMGogAkHQAGopAwA3AwAgAUH4DWpBOGogAkHYAGopAwA3AwAgASACQeAAaikDADcDuA4gASACKQMgNwP4DSACQYABaikDACEMIAJBigFqLQAAIQYgAkGJAWotAAAhByACQYgBai0AACEIAkAgAkHwDmooAgAiCUUNACACQZABaiIKIAlBBXRqIQtBASEFIAFB2A5qIQkDQCAJIAopAAA3AAAgCUEYaiAKQRhqKQAANwAAIAlBEGogCkEQaikAADcAACAJQQhqIApBCGopAAA3AAAgCkEgaiIKIAtGDQEgBUE3Rg0ZIAlBIGogCikAADcAACAJQThqIApBGGopAAA3AAAgCUEwaiAKQRBqKQAANwAAIAlBKGogCkEIaikAADcAACAJQcAAaiEJIAVBAmohBSAKQSBqIgogC0cNAAsgBUF/aiEFCyABIAU2ArgcIAFBBWogAUHYDmpB5A0QkAEaIAFB2A5qQQhqIAJBCGopAwA3AwAgAUHYDmpBEGogAkEQaikDADcDACABQdgOakEYaiACQRhqKQMANwMAIAEgAikDADcD2A4gAUHYDmpBIGogAUH4DWpB4AAQkAEaIAQgAUHYDmpBgAEQkAEiAiAGOgCKASACIAc6AIkBIAIgCDoAiAEgAiAMNwOAASACQYsBaiABQekNEJABGgwTC0EALQCA2EAaQegCEBkiBEUNFSACKALIASEJIAFB0AFqIAJB0AFqEGggAkHgAmotAAAhCiABIAJByAEQkAEiAkHgAmogCjoAACACIAk2AsgBIAQgAkHoAhCQARoMEgtBAC0AgNhAGkHgAhAZIgRFDRQgAigCyAEhCSABQdABaiACQdABahBpIAJB2AJqLQAAIQogASACQcgBEJABIgJB2AJqIAo6AAAgAiAJNgLIASAEIAJB4AIQkAEaDBELQQAtAIDYQBpBwAIQGSIERQ0TIAIoAsgBIQkgAUHQAWogAkHQAWoQaiACQbgCai0AACEKIAEgAkHIARCQASICQbgCaiAKOgAAIAIgCTYCyAEgBCACQcACEJABGgwQC0EALQCA2EAaQaACEBkiBEUNEiACKALIASEJIAFB0AFqIAJB0AFqEGsgAkGYAmotAAAhCiABIAJByAEQkAEiAkGYAmogCjoAACACIAk2AsgBIAQgAkGgAhCQARoMDwtBAC0AgNhAGkHgABAZIgRFDREgAikDECEMIAIpAwAhDSACKQMIIQ4gAUEYaiACQRhqEFUgAUHYAGogAkHYAGotAAA6AAAgASAONwMIIAEgDTcDACABIAw3AxAgBCABQeAAEJABGgwOC0EALQCA2EAaQeAAEBkiBEUNECACKQMQIQwgAikDACENIAIpAwghDiABQRhqIAJBGGoQVSABQdgAaiACQdgAai0AADoAACABIA43AwggASANNwMAIAEgDDcDECAEIAFB4AAQkAEaDA0LQQAtAIDYQBpB6AAQGSIERQ0PIAFBGGogAkEYaigCADYCACABQRBqIAJBEGopAwA3AwAgASACKQMINwMIIAIpAwAhDCABQSBqIAJBIGoQVSABQeAAaiACQeAAai0AADoAACABIAw3AwAgBCABQegAEJABGgwMC0EALQCA2EAaQegAEBkiBEUNDiABQRhqIAJBGGooAgA2AgAgAUEQaiACQRBqKQMANwMAIAEgAikDCDcDCCACKQMAIQwgAUEgaiACQSBqEFUgAUHgAGogAkHgAGotAAA6AAAgASAMNwMAIAQgAUHoABCQARoMCwtBAC0AgNhAGkHoAhAZIgRFDQ0gAigCyAEhCSABQdABaiACQdABahBoIAJB4AJqLQAAIQogASACQcgBEJABIgJB4AJqIAo6AAAgAiAJNgLIASAEIAJB6AIQkAEaDAoLQQAtAIDYQBpB4AIQGSIERQ0MIAIoAsgBIQkgAUHQAWogAkHQAWoQaSACQdgCai0AACEKIAEgAkHIARCQASICQdgCaiAKOgAAIAIgCTYCyAEgBCACQeACEJABGgwJC0EALQCA2EAaQcACEBkiBEUNCyACKALIASEJIAFB0AFqIAJB0AFqEGogAkG4AmotAAAhCiABIAJByAEQkAEiAkG4AmogCjoAACACIAk2AsgBIAQgAkHAAhCQARoMCAtBAC0AgNhAGkGgAhAZIgRFDQogAigCyAEhCSABQdABaiACQdABahBrIAJBmAJqLQAAIQogASACQcgBEJABIgJBmAJqIAo6AAAgAiAJNgLIASAEIAJBoAIQkAEaDAcLQQAtAIDYQBpB8AAQGSIERQ0JIAIpAyAhDCABQShqIAJBKGoQVSABQQhqIAJBCGopAwA3AwAgAUEQaiACQRBqKQMANwMAIAFBGGogAkEYaikDADcDACABQegAaiACQegAai0AADoAACABIAw3AyAgASACKQMANwMAIAQgAUHwABCQARoMBgtBAC0AgNhAGkHwABAZIgRFDQggAikDICEMIAFBKGogAkEoahBVIAFBCGogAkEIaikDADcDACABQRBqIAJBEGopAwA3AwAgAUEYaiACQRhqKQMANwMAIAFB6ABqIAJB6ABqLQAAOgAAIAEgDDcDICABIAIpAwA3AwAgBCABQfAAEJABGgwFC0EALQCA2EAaQdgBEBkiBEUNByACQcgAaikDACEMIAIpA0AhDSABQdAAaiACQdAAahBnIAFByABqIAw3AwAgAUEIaiACQQhqKQMANwMAIAFBEGogAkEQaikDADcDACABQRhqIAJBGGopAwA3AwAgAUEgaiACQSBqKQMANwMAIAFBKGogAkEoaikDADcDACABQTBqIAJBMGopAwA3AwAgAUE4aiACQThqKQMANwMAIAFB0AFqIAJB0AFqLQAAOgAAIAEgDTcDQCABIAIpAwA3AwAgBCABQdgBEJABGgwEC0EALQCA2EAaQdgBEBkiBEUNBiACQcgAaikDACEMIAIpA0AhDSABQdAAaiACQdAAahBnIAFByABqIAw3AwAgAUEIaiACQQhqKQMANwMAIAFBEGogAkEQaikDADcDACABQRhqIAJBGGopAwA3AwAgAUEgaiACQSBqKQMANwMAIAFBKGogAkEoaikDADcDACABQTBqIAJBMGopAwA3AwAgAUE4aiACQThqKQMANwMAIAFB0AFqIAJB0AFqLQAAOgAAIAEgDTcDQCABIAIpAwA3AwAgBCABQdgBEJABGgwDC0EALQCA2EAaQYADEBkiBEUNBSACKALIASEJIAFB0AFqIAJB0AFqEGwgAkH4AmotAAAhCiABIAJByAEQkAEiAkH4AmogCjoAACACIAk2AsgBIAQgAkGAAxCQARoMAgtBAC0AgNhAGkHgAhAZIgRFDQQgAigCyAEhCSABQdABaiACQdABahBpIAJB2AJqLQAAIQogASACQcgBEJABIgJB2AJqIAo6AAAgAiAJNgLIASAEIAJB4AIQkAEaDAELQQAtAIDYQBpB6AAQGSIERQ0DIAFBEGogAkEQaikDADcDACABQRhqIAJBGGopAwA3AwAgASACKQMINwMIIAIpAwAhDCABQSBqIAJBIGoQVSABQeAAaiACQeAAai0AADoAACABIAw3AwAgBCABQegAEJABGgsgACAAKAIAQX9qNgIAQQAtAIDYQBpBDBAZIgJFDQIgAiAENgIIIAIgAzYCBCACQQA2AgAgAUHAHGokACACDwsQigEACxCLAQALAAsQhwEAC+QjAgh/AX4CQAJAAkACQAJAAkACQAJAIABB9QFJDQBBACEBIABBzf97Tw0FIABBC2oiAEF4cSECQQAoArjXQCIDRQ0EQQAhBAJAIAJBgAJJDQBBHyEEIAJB////B0sNACACQQYgAEEIdmciAGt2QQFxIABBAXRrQT5qIQQLQQAgAmshAQJAIARBAnRBnNTAAGooAgAiBQ0AQQAhAEEAIQYMAgtBACEAIAJBAEEZIARBAXZrQR9xIARBH0YbdCEHQQAhBgNAAkAgBSgCBEF4cSIIIAJJDQAgCCACayIIIAFPDQAgCCEBIAUhBiAIDQBBACEBIAUhBiAFIQAMBAsgBUEUaigCACIIIAAgCCAFIAdBHXZBBHFqQRBqKAIAIgVHGyAAIAgbIQAgB0EBdCEHIAVFDQIMAAsLAkBBACgCtNdAIgZBECAAQQtqQXhxIABBC0kbIgJBA3YiAXYiAEEDcUUNAAJAAkAgAEF/c0EBcSABaiIBQQN0IgJBtNXAAGooAgAiAEEIaiIHKAIAIgUgAkGs1cAAaiICRg0AIAUgAjYCDCACIAU2AggMAQtBACAGQX4gAXdxNgK010ALIAAgAUEDdCIBQQNyNgIEIAAgAWoiACAAKAIEQQFyNgIEIAcPCyACQQAoArzXQE0NAwJAAkACQAJAAkACQAJAAkAgAA0AQQAoArjXQCIARQ0LIABoQQJ0QZzUwABqKAIAIgcoAgRBeHEgAmshBQJAAkAgBygCECIADQAgB0EUaigCACIARQ0BCwNAIAAoAgRBeHEgAmsiCCAFSSEGAkAgACgCECIBDQAgAEEUaigCACEBCyAIIAUgBhshBSAAIAcgBhshByABIQAgAQ0ACwsgBygCGCEEIAcoAgwiACAHRw0BIAdBFEEQIAdBFGoiACgCACIGG2ooAgAiAQ0CQQAhAAwDCwJAAkBBAiABQR9xIgF0IgVBACAFa3IgACABdHFoIgFBA3QiB0G01cAAaigCACIAQQhqIggoAgAiBSAHQazVwABqIgdGDQAgBSAHNgIMIAcgBTYCCAwBC0EAIAZBfiABd3E2ArTXQAsgACACQQNyNgIEIAAgAmoiBiABQQN0IgUgAmsiAUEBcjYCBCAAIAVqIAE2AgBBACgCvNdAIgINAwwGCyAHKAIIIgEgADYCDCAAIAE2AggMAQsgACAHQRBqIAYbIQYDQCAGIQggASIAQRRqIgEgAEEQaiABKAIAIgEbIQYgAEEUQRAgARtqKAIAIgENAAsgCEEANgIACyAERQ0CAkAgBygCHEECdEGc1MAAaiIBKAIAIAdGDQAgBEEQQRQgBCgCECAHRhtqIAA2AgAgAEUNAwwCCyABIAA2AgAgAA0BQQBBACgCuNdAQX4gBygCHHdxNgK410AMAgsgAkF4cUGs1cAAaiEFQQAoAsTXQCEAAkACQEEAKAK010AiB0EBIAJBA3Z0IgJxDQBBACAHIAJyNgK010AgBSECDAELIAUoAgghAgsgBSAANgIIIAIgADYCDCAAIAU2AgwgACACNgIIDAILIAAgBDYCGAJAIAcoAhAiAUUNACAAIAE2AhAgASAANgIYCyAHQRRqKAIAIgFFDQAgAEEUaiABNgIAIAEgADYCGAsCQAJAAkAgBUEQSQ0AIAcgAkEDcjYCBCAHIAJqIgEgBUEBcjYCBCABIAVqIAU2AgBBACgCvNdAIgZFDQEgBkF4cUGs1cAAaiECQQAoAsTXQCEAAkACQEEAKAK010AiCEEBIAZBA3Z0IgZxDQBBACAIIAZyNgK010AgAiEGDAELIAIoAgghBgsgAiAANgIIIAYgADYCDCAAIAI2AgwgACAGNgIIDAELIAcgBSACaiIAQQNyNgIEIAcgAGoiACAAKAIEQQFyNgIEDAELQQAgATYCxNdAQQAgBTYCvNdACyAHQQhqDwtBACAGNgLE10BBACABNgK810AgCA8LAkAgACAGcg0AQQAhBiADQQIgBHQiAEEAIABrcnEiAEUNAyAAaEECdEGc1MAAaigCACEACyAARQ0BCwNAIAAgBiAAKAIEQXhxIgUgAmsiCCABSSIEGyEDIAUgAkkhByAIIAEgBBshCAJAIAAoAhAiBQ0AIABBFGooAgAhBQsgBiADIAcbIQYgASAIIAcbIQEgBSEAIAUNAAsLIAZFDQACQEEAKAK810AiACACSQ0AIAEgACACa08NAQsgBigCGCEEAkACQAJAIAYoAgwiACAGRw0AIAZBFEEQIAZBFGoiACgCACIHG2ooAgAiBQ0BQQAhAAwCCyAGKAIIIgUgADYCDCAAIAU2AggMAQsgACAGQRBqIAcbIQcDQCAHIQggBSIAQRRqIgUgAEEQaiAFKAIAIgUbIQcgAEEUQRAgBRtqKAIAIgUNAAsgCEEANgIACyAERQ0DAkAgBigCHEECdEGc1MAAaiIFKAIAIAZGDQAgBEEQQRQgBCgCECAGRhtqIAA2AgAgAEUNBAwDCyAFIAA2AgAgAA0CQQBBACgCuNdAQX4gBigCHHdxNgK410AMAwsCQAJAAkACQAJAAkACQAJAQQAoArzXQCIAIAJPDQACQEEAKALA10AiACACSw0AQQAhASACQa+ABGoiBUEQdkAAIgBBf0YiBw0JIABBEHQiBkUNCUEAQQAoAszXQEEAIAVBgIB8cSAHGyIIaiIANgLM10BBAEEAKALQ10AiASAAIAEgAEsbNgLQ10ACQAJAAkBBACgCyNdAIgFFDQBBnNXAACEAA0AgACgCACIFIAAoAgQiB2ogBkYNAiAAKAIIIgANAAwDCwsCQAJAQQAoAtjXQCIARQ0AIAAgBk0NAQtBACAGNgLY10ALQQBB/x82AtzXQEEAIAg2AqDVQEEAIAY2ApzVQEEAQazVwAA2ArjVQEEAQbTVwAA2AsDVQEEAQazVwAA2ArTVQEEAQbzVwAA2AsjVQEEAQbTVwAA2ArzVQEEAQcTVwAA2AtDVQEEAQbzVwAA2AsTVQEEAQczVwAA2AtjVQEEAQcTVwAA2AszVQEEAQdTVwAA2AuDVQEEAQczVwAA2AtTVQEEAQdzVwAA2AujVQEEAQdTVwAA2AtzVQEEAQeTVwAA2AvDVQEEAQdzVwAA2AuTVQEEAQQA2AqjVQEEAQezVwAA2AvjVQEEAQeTVwAA2AuzVQEEAQezVwAA2AvTVQEEAQfTVwAA2AoDWQEEAQfTVwAA2AvzVQEEAQfzVwAA2AojWQEEAQfzVwAA2AoTWQEEAQYTWwAA2ApDWQEEAQYTWwAA2AozWQEEAQYzWwAA2ApjWQEEAQYzWwAA2ApTWQEEAQZTWwAA2AqDWQEEAQZTWwAA2ApzWQEEAQZzWwAA2AqjWQEEAQZzWwAA2AqTWQEEAQaTWwAA2ArDWQEEAQaTWwAA2AqzWQEEAQazWwAA2ArjWQEEAQbTWwAA2AsDWQEEAQazWwAA2ArTWQEEAQbzWwAA2AsjWQEEAQbTWwAA2ArzWQEEAQcTWwAA2AtDWQEEAQbzWwAA2AsTWQEEAQczWwAA2AtjWQEEAQcTWwAA2AszWQEEAQdTWwAA2AuDWQEEAQczWwAA2AtTWQEEAQdzWwAA2AujWQEEAQdTWwAA2AtzWQEEAQeTWwAA2AvDWQEEAQdzWwAA2AuTWQEEAQezWwAA2AvjWQEEAQeTWwAA2AuzWQEEAQfTWwAA2AoDXQEEAQezWwAA2AvTWQEEAQfzWwAA2AojXQEEAQfTWwAA2AvzWQEEAQYTXwAA2ApDXQEEAQfzWwAA2AoTXQEEAQYzXwAA2ApjXQEEAQYTXwAA2AozXQEEAQZTXwAA2AqDXQEEAQYzXwAA2ApTXQEEAQZzXwAA2AqjXQEEAQZTXwAA2ApzXQEEAQaTXwAA2ArDXQEEAQZzXwAA2AqTXQEEAIAY2AsjXQEEAQaTXwAA2AqzXQEEAIAhBWGoiADYCwNdAIAYgAEEBcjYCBCAGIABqQSg2AgRBAEGAgIABNgLU10AMCgsgACgCDA0AIAUgAUsNACABIAZJDQMLQQBBACgC2NdAIgAgBiAAIAZJGzYC2NdAIAYgCGohBUGc1cAAIQACQAJAAkADQCAAKAIAIAVGDQEgACgCCCIADQAMAgsLIAAoAgxFDQELQZzVwAAhAAJAA0ACQCAAKAIAIgUgAUsNACAFIAAoAgRqIgUgAUsNAgsgACgCCCEADAALC0EAIAY2AsjXQEEAIAhBWGoiADYCwNdAIAYgAEEBcjYCBCAGIABqQSg2AgRBAEGAgIABNgLU10AgASAFQWBqQXhxQXhqIgAgACABQRBqSRsiB0EbNgIEQQApApzVQCEJIAdBEGpBACkCpNVANwIAIAcgCTcCCEEAIAg2AqDVQEEAIAY2ApzVQEEAIAdBCGo2AqTVQEEAQQA2AqjVQCAHQRxqIQADQCAAQQc2AgAgAEEEaiIAIAVJDQALIAcgAUYNCSAHIAcoAgRBfnE2AgQgASAHIAFrIgBBAXI2AgQgByAANgIAAkAgAEGAAkkNACABIAAQQQwKCyAAQXhxQazVwABqIQUCQAJAQQAoArTXQCIGQQEgAEEDdnQiAHENAEEAIAYgAHI2ArTXQCAFIQAMAQsgBSgCCCEACyAFIAE2AgggACABNgIMIAEgBTYCDCABIAA2AggMCQsgACAGNgIAIAAgACgCBCAIajYCBCAGIAJBA3I2AgQgBSAGIAJqIgBrIQEgBUEAKALI10BGDQMgBUEAKALE10BGDQQCQCAFKAIEIgJBA3FBAUcNAAJAAkAgAkF4cSIHQYACSQ0AIAUQPgwBCwJAIAVBDGooAgAiCCAFQQhqKAIAIgRGDQAgBCAINgIMIAggBDYCCAwBC0EAQQAoArTXQEF+IAJBA3Z3cTYCtNdACyAHIAFqIQEgBSAHaiIFKAIEIQILIAUgAkF+cTYCBCAAIAFBAXI2AgQgACABaiABNgIAAkAgAUGAAkkNACAAIAEQQQwICyABQXhxQazVwABqIQUCQAJAQQAoArTXQCICQQEgAUEDdnQiAXENAEEAIAIgAXI2ArTXQCAFIQEMAQsgBSgCCCEBCyAFIAA2AgggASAANgIMIAAgBTYCDCAAIAE2AggMBwtBACAAIAJrIgE2AsDXQEEAQQAoAsjXQCIAIAJqIgU2AsjXQCAFIAFBAXI2AgQgACACQQNyNgIEIABBCGohAQwIC0EAKALE10AhASAAIAJrIgVBEEkNA0EAIAU2ArzXQEEAIAEgAmoiBjYCxNdAIAYgBUEBcjYCBCABIABqIAU2AgAgASACQQNyNgIEDAQLIAAgByAIajYCBEEAQQAoAsjXQCIAQQ9qQXhxIgFBeGoiBTYCyNdAQQAgACABa0EAKALA10AgCGoiAWpBCGoiBjYCwNdAIAUgBkEBcjYCBCAAIAFqQSg2AgRBAEGAgIABNgLU10AMBQtBACAANgLI10BBAEEAKALA10AgAWoiATYCwNdAIAAgAUEBcjYCBAwDC0EAIAA2AsTXQEEAQQAoArzXQCABaiIBNgK810AgACABQQFyNgIEIAAgAWogATYCAAwCC0EAQQA2AsTXQEEAQQA2ArzXQCABIABBA3I2AgQgASAAaiIAIAAoAgRBAXI2AgQLIAFBCGoPCyAGQQhqDwtBACEBQQAoAsDXQCIAIAJNDQBBACAAIAJrIgE2AsDXQEEAQQAoAsjXQCIAIAJqIgU2AsjXQCAFIAFBAXI2AgQgACACQQNyNgIEIABBCGoPCyABDwsgACAENgIYAkAgBigCECIFRQ0AIAAgBTYCECAFIAA2AhgLIAZBFGooAgAiBUUNACAAQRRqIAU2AgAgBSAANgIYCwJAAkAgAUEQSQ0AIAYgAkEDcjYCBCAGIAJqIgAgAUEBcjYCBCAAIAFqIAE2AgACQCABQYACSQ0AIAAgARBBDAILIAFBeHFBrNXAAGohBQJAAkBBACgCtNdAIgJBASABQQN2dCIBcQ0AQQAgAiABcjYCtNdAIAUhAQwBCyAFKAIIIQELIAUgADYCCCABIAA2AgwgACAFNgIMIAAgATYCCAwBCyAGIAEgAmoiAEEDcjYCBCAGIABqIgAgACgCBEEBcjYCBAsgBkEIagvVHAICfwN+IwBB0A9rIgMkAAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQCACQX1qDgkDCwkKAQQLAgALCwJAAkACQAJAIAFBl4DAAEELEI8BRQ0AIAFBooDAAEELEI8BRQ0BIAFBrYDAAEELEI8BRQ0CIAFBuIDAAEELEI8BRQ0DIAFBw4DAAEELEI8BDQ5BAC0AgNhAGkHQARAZIgFFDRQgAUL5wvibkaOz8NsANwM4IAFC6/qG2r+19sEfNwMwIAFCn9j52cKR2oKbfzcDKCABQtGFmu/6z5SH0QA3AyAgAULx7fT4paf9p6V/NwMYIAFCq/DT9K/uvLc8NwMQIAFCu86qptjQ67O7fzcDCCABQriS95X/zPmE6gA3AwAgAUHAAGpBAEGJARCOARpBBSECDBILQQAtAIDYQBpB0AEQGSIBRQ0TIAFC+cL4m5Gjs/DbADcDOCABQuv6htq/tfbBHzcDMCABQp/Y+dnCkdqCm383AyggAULRhZrv+s+Uh9EANwMgIAFC8e30+KWn/aelfzcDGCABQqvw0/Sv7ry3PDcDECABQrvOqqbY0Ouzu383AwggAUKYkveV/8z5hOoANwMAIAFBwABqQQBBiQEQjgEaQQEhAgwRC0EALQCA2EAaQdABEBkiAUUNEiABQvnC+JuRo7Pw2wA3AzggAULr+obav7X2wR83AzAgAUKf2PnZwpHagpt/NwMoIAFC0YWa7/rPlIfRADcDICABQvHt9Pilp/2npX83AxggAUKr8NP0r+68tzw3AxAgAUK7zqqm2NDrs7t/NwMIIAFCnJL3lf/M+YTqADcDACABQcAAakEAQYkBEI4BGkECIQIMEAtBAC0AgNhAGkHQARAZIgFFDREgAUL5wvibkaOz8NsANwM4IAFC6/qG2r+19sEfNwMwIAFCn9j52cKR2oKbfzcDKCABQtGFmu/6z5SH0QA3AyAgAULx7fT4paf9p6V/NwMYIAFCq/DT9K/uvLc8NwMQIAFCu86qptjQ67O7fzcDCCABQpSS95X/zPmE6gA3AwAgAUHAAGpBAEGJARCOARpBAyECDA8LQQAtAIDYQBpB0AEQGSIBRQ0QIAFC+cL4m5Gjs/DbADcDOCABQuv6htq/tfbBHzcDMCABQp/Y+dnCkdqCm383AyggAULRhZrv+s+Uh9EANwMgIAFC8e30+KWn/aelfzcDGCABQqvw0/Sv7ry3PDcDECABQrvOqqbY0Ouzu383AwggAUKokveV/8z5hOoANwMAIAFBwABqQQBBiQEQjgEaQQQhAgwOCyABQZCAwABBBxCPAUUNDAJAIAFBzoDAAEEHEI8BRQ0AIAFBmIHAACACEI8BRQ0EIAFBn4HAACACEI8BRQ0FIAFBpoHAACACEI8BRQ0GIAFBrYHAACACEI8BDQpBAC0AgNhAGkHYARAZIgFFDRAgAUE4akEAKQPwjUA3AwAgAUEwakEAKQPojUA3AwAgAUEoakEAKQPgjUA3AwAgAUEgakEAKQPYjUA3AwAgAUEYakEAKQPQjUA3AwAgAUEQakEAKQPIjUA3AwAgAUEIakEAKQPAjUA3AwAgAUEAKQO4jUA3AwAgAUHAAGpBAEGRARCOARpBFyECDA4LQQAtAIDYQBpB8AAQGSIBRQ0PIAFCq7OP/JGjs/DbADcDGCABQv+kuYjFkdqCm383AxAgAULy5rvjo6f9p6V/NwMIIAFCx8yj2NbQ67O7fzcDACABQSBqQQBByQAQjgEaQQYhAgwNCwJAAkACQAJAIAFB24DAAEEKEI8BRQ0AIAFB5YDAAEEKEI8BRQ0BIAFB74DAAEEKEI8BRQ0CIAFB+YDAAEEKEI8BRQ0DIAFBiYHAAEEKEI8BDQxBAC0AgNhAGkHoABAZIgFFDRIgAUIANwMAIAFBACkDoIxANwMIIAFBEGpBACkDqIxANwMAIAFBGGpBACgCsIxANgIAIAFBIGpBAEHBABCOARpBDiECDBALIANBBGpBAEGQARCOARpBAC0AgNhAGkHoAhAZIgFFDREgAUEAQcgBEI4BIgJBGDYCyAEgAkHMAWogA0GUARCQARogAkEAOgDgAkEIIQIMDwsgA0EEakEAQYgBEI4BGkEALQCA2EAaQeACEBkiAUUNECABQQBByAEQjgEiAkEYNgLIASACQcwBaiADQYwBEJABGiACQQA6ANgCQQkhAgwOCyADQQRqQQBB6AAQjgEaQQAtAIDYQBpBwAIQGSIBRQ0PIAFBAEHIARCOASICQRg2AsgBIAJBzAFqIANB7AAQkAEaIAJBADoAuAJBCiECDA0LIANBBGpBAEHIABCOARpBAC0AgNhAGkGgAhAZIgFFDQ4gAUEAQcgBEI4BIgJBGDYCyAEgAkHMAWogA0HMABCQARogAkEAOgCYAkELIQIMDAsCQCABQYOBwABBAxCPAUUNACABQYaBwABBAxCPAQ0IQQAtAIDYQBpB4AAQGSIBRQ0OIAFC/rnrxemOlZkQNwMIIAFCgcaUupbx6uZvNwMAIAFBEGpBAEHJABCOARpBDSECDAwLQQAtAIDYQBpB4AAQGSIBRQ0NIAFC/rnrxemOlZkQNwMIIAFCgcaUupbx6uZvNwMAIAFBEGpBAEHJABCOARpBDCECDAsLAkACQAJAAkAgASkAAELTkIWa08WMmTRRDQAgASkAAELTkIWa08XMmjZRDQEgASkAAELTkIWa0+WMnDRRDQIgASkAAELTkIWa06XNmDJRDQMgASkAAELTkIXa1KiMmThRDQcgASkAAELTkIXa1MjMmjZSDQogA0EEakEAQYgBEI4BGkEALQCA2EAaQeACEBkiAUUNECABQQBByAEQjgEiAkEYNgLIASACQcwBaiADQYwBEJABGiACQQA6ANgCQRkhAgwOCyADQQRqQQBBkAEQjgEaQQAtAIDYQBpB6AIQGSIBRQ0PIAFBAEHIARCOASICQRg2AsgBIAJBzAFqIANBlAEQkAEaIAJBADoA4AJBECECDA0LIANBBGpBAEGIARCOARpBAC0AgNhAGkHgAhAZIgFFDQ4gAUEAQcgBEI4BIgJBGDYCyAEgAkHMAWogA0GMARCQARogAkEAOgDYAkERIQIMDAsgA0EEakEAQegAEI4BGkEALQCA2EAaQcACEBkiAUUNDSABQQBByAEQjgEiAkEYNgLIASACQcwBaiADQewAEJABGiACQQA6ALgCQRIhAgwLCyADQQRqQQBByAAQjgEaQQAtAIDYQBpBoAIQGSIBRQ0MIAFBAEHIARCOASICQRg2AsgBIAJBzAFqIANBzAAQkAEaIAJBADoAmAJBEyECDAoLQQAtAIDYQBpB8AAQGSIBRQ0LIAFBGGpBACkD0IxANwMAIAFBEGpBACkDyIxANwMAIAFBCGpBACkDwIxANwMAIAFBACkDuIxANwMAIAFBIGpBAEHJABCOARpBFCECDAkLQQAtAIDYQBpB8AAQGSIBRQ0KIAFBGGpBACkD8IxANwMAIAFBEGpBACkD6IxANwMAIAFBCGpBACkD4IxANwMAIAFBACkD2IxANwMAIAFBIGpBAEHJABCOARpBFSECDAgLQQAtAIDYQBpB2AEQGSIBRQ0JIAFBOGpBACkDsI1ANwMAIAFBMGpBACkDqI1ANwMAIAFBKGpBACkDoI1ANwMAIAFBIGpBACkDmI1ANwMAIAFBGGpBACkDkI1ANwMAIAFBEGpBACkDiI1ANwMAIAFBCGpBACkDgI1ANwMAIAFBACkD+IxANwMAIAFBwABqQQBBkQEQjgEaQRYhAgwHCyADQQRqQQBBqAEQjgEaQQAtAIDYQBpBgAMQGSIBRQ0IQRghAiABQQBByAEQjgEiBEEYNgLIASAEQcwBaiADQawBEJABGiAEQQA6APgCDAYLIAFBk4HAAEEFEI8BRQ0CIAFBtIHAAEEFEI8BDQFBAC0AgNhAGkHoABAZIgFFDQcgAUIANwMAIAFBACkDkNNANwMIIAFBEGpBACkDmNNANwMAIAFBGGpBACkDoNNANwMAIAFBIGpBAEHBABCOARpBGiECDAULIAFB1YDAAEEGEI8BRQ0CCyAAQbmBwAA2AgQgAEEIakEVNgIAQQEhAQwEC0EALQCA2EAaQegAEBkiAUUNBCABQfDDy558NgIYIAFC/rnrxemOlZkQNwMQIAFCgcaUupbx6uZvNwMIIAFCADcDACABQSBqQQBBwQAQjgEaQQ8hAgwCCyADQagPakIANwMAIANBoA9qQgA3AwAgA0GYD2pCADcDACADQfAOakEgakIANwMAIANB8A5qQRhqQgA3AwAgA0HwDmpBEGpCADcDACADQfAOakEIakIANwMAIANBuA9qQQApA+CMQCIFNwMAIANBwA9qQQApA+iMQCIGNwMAIANByA9qQQApA/CMQCIHNwMAIANBCGogBTcDACADQRBqIAY3AwAgA0EYaiAHNwMAIANCADcD8A4gA0EAKQPYjEAiBTcDsA8gAyAFNwMAIANBIGogA0HwDmpB4AAQkAEaIANBhwFqQQA2AAAgA0IANwOAAUEALQCA2EAaQfgOEBkiAUUNAyABIANB8A4QkAFBADYC8A5BByECDAELQQAhAkEALQCA2EAaQdABEBkiAUUNAiABQvnC+JuRo7Pw2wA3AzggAULr+obav7X2wR83AzAgAUKf2PnZwpHagpt/NwMoIAFC0YWa7/rPlIfRADcDICABQvHt9Pilp/2npX83AxggAUKr8NP0r+68tzw3AxAgAUK7zqqm2NDrs7t/NwMIIAFCyJL3lf/M+YTqADcDACABQcAAakEAQYkBEI4BGgsgACACNgIEIABBCGogATYCAEEAIQELIAAgATYCACADQdAPaiQADwsAC/AQARl/IAAoAgAiAyADKQMQIAKtfDcDEAJAIAJFDQAgASACQQZ0aiEEIAMoAgwhBSADKAIIIQYgAygCBCECIAMoAgAhBwNAIAMgASgAECIIIAEoACAiCSABKAAwIgogASgAACILIAEoACQiDCABKAA0Ig0gASgABCIOIAEoABQiDyANIAwgDyAOIAogCSAIIAsgAiAGcSAFIAJBf3NxciAHampB+Miqu31qQQd3IAJqIgBqIAUgDmogBiAAQX9zcWogACACcWpB1u6exn5qQQx3IABqIhAgAiABKAAMIhFqIAAgECAGIAEoAAgiEmogAiAQQX9zcWogECAAcWpB2+GBoQJqQRF3aiITQX9zcWogEyAQcWpB7p33jXxqQRZ3IBNqIgBBf3NxaiAAIBNxakGvn/Crf2pBB3cgAGoiFGogDyAQaiATIBRBf3NxaiAUIABxakGqjJ+8BGpBDHcgFGoiECABKAAcIhUgAGogFCAQIAEoABgiFiATaiAAIBBBf3NxaiAQIBRxakGTjMHBempBEXdqIgBBf3NxaiAAIBBxakGBqppqakEWdyAAaiITQX9zcWogEyAAcWpB2LGCzAZqQQd3IBNqIhRqIAwgEGogACAUQX9zcWogFCATcWpBr++T2nhqQQx3IBRqIhAgASgA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A3w3A+ABIAdBgAFqIAAgCWogARAvIQQgB0HIAGogCCkDADcDACAHQdAAaiALKQMANwMAIAdB2ABqIAwpAwA3AwAgB0EIaiAEQQhqKQMANwMAIAdBEGogBEEQaikDADcDACAHQRhqIARBGGopAwA3AwAgB0EgaiAEQSBqKQMANwMAIAdBKGogBEEoaikDADcDACAHQTBqIARBMGopAwA3AwAgB0E4aiAEQThqKQMANwMAIAcgBykDwAE3A0AgByAEKQMANwMAIActAOoBIQQgBy0A6QEhACAHKQPgASEDIAcgBy0A6AEiAToAaCAHIAM3A2AgByAEIABFckECciIEOgBpIAdB8AFqQRhqIgAgDCkDADcDACAHQfABakEQaiICIAspAwA3AwAgB0HwAWpBCGoiCSAIKQMANwMAIAcgBykDwAE3A/ABIAdB8AFqIAcgASADIAQQFyAKQQV0IgRBIGoiASAGSw0DIAdB8AFqQR9qLQAAIQEgB0HwAWpBHmotAAAhBiAHQfABakEdai0AACEIIAdB8AFqQRtqLQAAIQsgB0HwAWpBGmotAAAhDCAHQfABakEZai0AACENIAAtAAAhACAHQfABakEXai0AACEOIAdB8AFqQRZqLQAAIQ8gB0HwAWpBFWotAAAhECAHQfABakETai0AACERIAdB8AFqQRJqLQAAIRIgB0HwAWpBEWotAAAhEyACLQAAIQIgB0HwAWpBD2otAAAhFCAHQfABakEOai0AACEVIAdB8AFqQQ1qLQAAIRYgB0HwAWpBC2otAAAhFyAHQfABakEKai0AACEYIAdB8AFqQQlqLQAAIRkgCS0AACEJIActAIQCIRogBy0A/AEhGyAHLQD3ASEcIActAPYBIR0gBy0A9QEhHiAHLQD0ASEfIActAPMBISAgBy0A8gEhISAHLQDxASEiIActAPABISMgBSAEaiIEIActAIwCOgAcIAQgADoAGCAEIBo6ABQgBCACOgAQIAQgGzoADCAEIAk6AAggBCAfOgAEIAQgIjoAASAEICM6AAAgBEEeaiAGOgAAIARBHWogCDoAACAEQRpqIAw6AAAgBEEZaiANOgAAIARBFmogDzoAACAEQRVqIBA6AAAgBEESaiASOgAAIARBEWogEzoAACAEQQ5qIBU6AAAgBEENaiAWOgAAIARBCmogGDoAACAEQQlqIBk6AAAgBEEGaiAdOgAAIARBBWogHjoAACAEICE6AAIgBEEfaiABOgAAIARBG2ogCzoAACAEQRdqIA46AAAgBEETaiAROgAAIARBD2ogFDoAACAEQQtqIBc6AAAgBEEHaiAcOgAAIARBA2ogIDoAACAKQQFqIQoMAQsgACAJIAIgAyAEIAdBAEGAARCOASIKQSBBwAAgCBsiCBAdIQsgACAJaiABIAlrIAIgCUEKdq0gA3wgBCAKIAhqQYABIAhrEB0hAAJAIAtBAUcNACAGQT9NDQQgBSAKKQAANwAAIAVBOGogCkE4aikAADcAACAFQTBqIApBMGopAAA3AAAgBUEoaiAKQShqKQAANwAAIAVBIGogCkEgaikAADcAACAFQRhqIApBGGopAAA3AAAgBUEQaiAKQRBqKQAANwAAIAVBCGogCkEIaikAADcAAEECIQoMAQsgACALakEFdCIAQYEBTw0EIAogACACIAQgBSAGECwhCgsgB0GQAmokACAKDwsgByAAQYAIajYCAEGMksAAIAdB/IbAAEH0g8AAEF8ACyABIAZB5IPAABBgAAtBwAAgBkHUhMAAEGAACyAAQYABQeSEwAAQYAALrhQBBH8jAEHgAGsiAiQAAkACQCABRQ0AIAEoAgANASABQX82AgACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQCABKAIEDhsAAQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRoACyABQQhqKAIAIgNCADcDQCADQvnC+JuRo7Pw2wA3AzggA0Lr+obav7X2wR83AzAgA0Kf2PnZwpHagpt/NwMoIANC0YWa7/rPlIfRADcDICADQvHt9Pilp/2npX83AxggA0Kr8NP0r+68tzw3AxAgA0K7zqqm2NDrs7t/NwMIIANCyJL3lf/M+YTqADcDACADQcgBakEAOgAADBoLIAFBCGooAgAiA0IANwNAIANC+cL4m5Gjs/DbADcDOCADQuv6htq/tfbBHzcDMCADQp/Y+dnCkdqCm383AyggA0LRhZrv+s+Uh9EANwMgIANC8e30+KWn/aelfzcDGCADQqvw0/Sv7ry3PDcDECADQrvOqqbY0Ouzu383AwggA0KYkveV/8z5hOoANwMAIANByAFqQQA6AAAMGQsgAUEIaigCACIDQgA3A0AgA0L5wvibkaOz8NsANwM4IANC6/qG2r+19sEfNwMwIANCn9j52cKR2oKbfzcDKCADQtGFmu/6z5SH0QA3AyAgA0Lx7fT4paf9p6V/NwMYIANCq/DT9K/uvLc8NwMQIANCu86qptjQ67O7fzcDCCADQpyS95X/zPmE6gA3AwAgA0HIAWpBADoAAAwYCyABQQhqKAIAIgNCADcDQCADQvnC+JuRo7Pw2wA3AzggA0Lr+obav7X2wR83AzAgA0Kf2PnZwpHagpt/NwMoIANC0YWa7/rPlIfRADcDICADQvHt9Pilp/2npX83AxggA0Kr8NP0r+68tzw3AxAgA0K7zqqm2NDrs7t/NwMIIANClJL3lf/M+YTqADcDACADQcgBakEAOgAADBcLIAFBCGooAgAiA0IANwNAIANC+cL4m5Gjs/DbADcDOCADQuv6htq/tfbBHzcDMCADQp/Y+dnCkdqCm383AyggA0LRhZrv+s+Uh9EANwMgIANC8e30+KWn/aelfzcDGCADQqvw0/Sv7ry3PDcDECADQrvOqqbY0Ouzu383AwggA0KokveV/8z5hOoANwMAIANByAFqQQA6AAAMFgsgAUEIaigCACIDQgA3A0AgA0L5wvibkaOz8NsANwM4IANC6/qG2r+19sEfNwMwIANCn9j52cKR2oKbfzcDKCADQtGFmu/6z5SH0QA3AyAgA0Lx7fT4paf9p6V/NwMYIANCq/DT9K/uvLc8NwMQIANCu86qptjQ67O7fzcDCCADQriS95X/zPmE6gA3AwAgA0HIAWpBADoAAAwVCyABQQhqKAIAIgNCADcDICADQquzj/yRo7Pw2wA3AxggA0L/pLmIxZHagpt/NwMQIANC8ua746On/aelfzcDCCADQsfMo9jW0Ouzu383AwAgA0HoAGpBADoAAAwUCyABQQhqKAIAIQMgAkEIakIANwMAIAJBEGpCADcDACACQRhqQgA3AwAgAkEgakIANwMAIAJBKGpCADcDACACQTBqQgA3AwAgAkE4akIANwMAIAJByABqIANBCGopAwA3AwAgAkHQAGogA0EQaikDADcDACACQdgAaiADQRhqKQMANwMAIAJCADcDACACIAMpAwA3A0AgA0GKAWoiBC0AACEFIANBIGogAkHgABCQARogBCAFOgAAIANBiAFqQQA7AQAgA0GAAWpCADcDACADQfAOaigCAEUNEyADQQA2AvAODBMLIAFBCGooAgBBAEHIARCOASIDQeACakEAOgAAIANBGDYCyAEMEgsgAUEIaigCAEEAQcgBEI4BIgNB2AJqQQA6AAAgA0EYNgLIAQwRCyABQQhqKAIAQQBByAEQjgEiA0G4AmpBADoAACADQRg2AsgBDBALIAFBCGooAgBBAEHIARCOASIDQZgCakEAOgAAIANBGDYCyAEMDwsgAUEIaigCACIDQv6568XpjpWZEDcDCCADQoHGlLqW8ermbzcDACADQgA3AxAgA0HYAGpBADoAAAwOCyABQQhqKAIAIgNC/rnrxemOlZkQNwMIIANCgcaUupbx6uZvNwMAIANCADcDECADQdgAakEAOgAADA0LIAFBCGooAgAiA0IANwMAIANBACkDoIxANwMIIANBEGpBACkDqIxANwMAIANBGGpBACgCsIxANgIAIANB4ABqQQA6AAAMDAsgAUEIaigCACIDQfDDy558NgIYIANC/rnrxemOlZkQNwMQIANCgcaUupbx6uZvNwMIIANCADcDACADQeAAakEAOgAADAsLIAFBCGooAgBBAEHIARCOASIDQeACakEAOgAAIANBGDYCyAEMCgsgAUEIaigCAEEAQcgBEI4BIgNB2AJqQQA6AAAgA0EYNgLIAQwJCyABQQhqKAIAQQBByAEQjgEiA0G4AmpBADoAACADQRg2AsgBDAgLIAFBCGooAgBBAEHIARCOASIDQZgCakEAOgAAIANBGDYCyAEMBwsgAUEIaigCACIDQQApA7iMQDcDACADQgA3AyAgA0EIakEAKQPAjEA3AwAgA0EQakEAKQPIjEA3AwAgA0EYakEAKQPQjEA3AwAgA0HoAGpBADoAAAwGCyABQQhqKAIAIgNBACkD2IxANwMAIANCADcDICADQQhqQQApA+CMQDcDACADQRBqQQApA+iMQDcDACADQRhqQQApA/CMQDcDACADQegAakEAOgAADAULIAFBCGooAgAiA0IANwNAIANBACkD+IxANwMAIANByABqQgA3AwAgA0EIakEAKQOAjUA3AwAgA0EQakEAKQOIjUA3AwAgA0EYakEAKQOQjUA3AwAgA0EgakEAKQOYjUA3AwAgA0EoakEAKQOgjUA3AwAgA0EwakEAKQOojUA3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GDcDACACIB03A3AgAkHIAWogAUEYaikDADcDACACQcABaiABQRBqKQMANwMAIAJBuAFqIAFBCGopAwA3AwAgAiABKQMANwOwASACIAJB8ABqQeAAEJABIgUgCEEEciIJOgBpQcAAIQcgBUHAADoAaEIAIRYgBUIANwNgIAkhCiAERQ0DDAILIAJB8ABqQcgAaiABQegAaikDADcDACACQfAAakHQAGogAUHwAGopAwA3AwAgAkHwAGpB2ABqIAFB+ABqKQMANwMAIAJB+ABqIAFBKGopAwA3AwAgAkGAAWogAUEwaikDADcDACACQYgBaiABQThqKQMANwMAIAJBkAFqIAFBwABqKQMANwMAIAJB8ABqQShqIAFByABqKQMANwMAIAJB8ABqQTBqIAFB0ABqKQMANwMAIAJB8ABqQThqIAFB2ABqKQMANwMAIAIgASkDIDcDcCACIAFB4ABqKQMANwOwASABQYABaikDACEWIAFBigFqLQAAIQUgAiACQfAAakHgABCQASIJIAUgBEVyQQJyIgo6AGkgCSAHOgBoIAkgFjcDYCAFQQRyIQkgAyEEDAELIAQgA0H0hcAAEGMACyAEQX9qIgsgA08iDA0DIAJB8ABqQRhqIgggAkHAAGoiBUEYaiINKQIANwMAIAJB8ABqQRBqIg4gBUEQaiIPKQIANwMAIAJB8ABqQQhqIhAgBUEIaiIRKQIANwMAIAIgBSkCADcDcCACQfAAaiACIAcgFiAKEBcgECkDACEWIA4pAwAhFyAIKQMAIRggAikDcCEZIAJBCGoiCiAGIAtBBXRqIgdBCGopAwA3AwAgAkEQaiIGIAdBEGopAwA3AwAgAkEYaiISIAdBGGopAwA3AwAgBSABKQMANwMAIBEgAUEIaiITKQMANwMAIA8gAUEQaiIUKQMANwMAIA0gAUEYaiIVKQMANwMAIAIgBykDADcDACACIAk6AGkgAkHAADoAaCACQgA3A2AgAiAYNwM4IAIgFzcDMCACIBY3AyggAiAZNwMgIAtFDQBBAiAEayEHIARBBXQgAWpB0ABqIQQDQCAMDQMgCCANKQIANwMAIA4gDykCADcDACAQIBEpAgA3AwAgAiAFKQIANwNwIAJB8ABqIAJBwABCACAJEBcgECkDACEWIA4pAwAhFyAIKQMAIRggAikDcCEZIAogBEEIaikDADcDACAGIARBEGopAwA3AwAgEiAEQRhqKQMANwMAIAUgASkDADcDACARIBMpAwA3AwAgDyAUKQMANwMAIA0gFSkDADcDACACIAQpAwA3AwAgAiAJOgBpIAJBwAA6AGggAkIANwNgIAIgGDcDOCACIBc3AzAgAiAWNwMoIAIgGTcDICAEQWBqIQQgB0EBaiIHQQFHDQALCyAAIAJB8AAQkAEaCyAAQQA6AHAgAkHQAWokAA8LQQAgB2shCwsgCyADQYSGwAAQYwAL1Q0CQn8DfiMAQdABayICJAACQAJAAkAgAEHwDmooAgAiAyABe6ciBE0NACADQQV0IQUgA0F/aiEGIAJBIGpBwABqIQcgAkGQAWpBIGohCCACQQhqIQkgAkEQaiEKIAJBGGohCyADQX5qQTdJIQwgAkGvAWohDSACQa4BaiEOIAJBrQFqIQ8gAkGrAWohECACQaoBaiERIAJBqQFqIRIgAkGnAWohEyACQaYBaiEUIAJBpQFqIRUgAkGjAWohFiACQaIBaiEXIAJBoQFqIRggAkGfAWohGSACQZ4BaiEaIAJBnQFqIRsgAkGbAWohHCACQZoBaiEdIAJBmQFqIR4DQCAAIAY2AvAOIAkgACAFaiIDQfgAaikAADcDACAKIANBgAFqKQAANwMAIAsgA0GIAWopAAA3AwAgAiADQfAAaikAADcDACAGRQ0CIAAgBkF/aiIfNgLwDiACQZABakEYaiIgIANB6ABqIiEpAAAiATcDACACQZABakEQaiIiIANB4ABqIiMpAAAiRDcDACACQZABakEIaiIkIANB2ABqIiUpAAAiRTcDACACIANB0ABqIiYpAAAiRjcDkAEgCCACKQMANwAAIAhBCGogCSkDADcAACAIQRBqIAopAwA3AAAgCEEYaiALKQMANwAAIAJBIGpBCGogRTcDACACQSBqQRBqIEQ3AwAgAkEgakEYaiABNwMAIAJBIGpBIGogCCkDADcDACACQSBqQShqIAJBkAFqQShqKQMANwMAIAJBIGpBMGogAkGQAWpBMGopAwA3AwAgAkEgakE4aiACQZABakE4aikDADcDACACIEY3AyAgAC0AigEhJyAHQRhqIABBGGoiKCkDADcDACAHQRBqIABBEGoiKSkDADcDACAHQQhqIABBCGoiKikDADcDACAHIAApAwA3AwAgAkHAADoAiAEgAkIANwOAASACICdBBHIiJzoAiQEgICAoKQIANwMAICIgKSkCADcDACAkICopAgA3AwAgAiAAKQIANwOQASACQZABaiACQSBqQcAAQgAgJxAXIA0tAAAhJyAOLQAAISggDy0AACEpIBAtAAAhKiARLQAAISsgEi0AACEsICAtAAAhICATLQAAIS0gFC0AACEuIBUtAAAhLyAWLQAAITAgFy0AACExIBgtAAAhMiAiLQAAISIgGS0AACEzIBotAAAhNCAbLQAAITUgHC0AACE2IB0tAAAhNyAeLQAAITggJC0AACEkIAItAKwBITkgAi0ApAEhOiACLQCcASE7IAItAJcBITwgAi0AlgEhPSACLQCVASE+IAItAJQBIT8gAi0AkwEhQCACLQCSASFBIAItAJEBIUIgAi0AkAEhQyAMRQ0DICYgQzoAACAmIEI6AAEgA0HuAGogKDoAACADQe0AaiApOgAAIANB7ABqIDk6AAAgA0HqAGogKzoAACADQekAaiAsOgAAICEgIDoAACADQeYAaiAuOgAAIANB5QBqIC86AAAgA0HkAGogOjoAACADQeIAaiAxOgAAIANB4QBqIDI6AAAgIyAiOgAAIANB3gBqIDQ6AAAgA0HdAGogNToAACADQdwAaiA7OgAAIANB2gBqIDc6AAAgA0HZAGogODoAACAlICQ6AAAgA0HWAGogPToAACADQdUAaiA+OgAAIANB1ABqID86AAAgJiBBOgACIANB7wBqICc6AAAgA0HrAGogKjoAACADQecAaiAtOgAAIANB4wBqIDA6AAAgA0HfAGogMzoAACADQdsAaiA2OgAAIANB1wBqIDw6AAAgJkEDaiBAOgAAIAAgBjYC8A4gBUFgaiEFIB8hBiAfIARPDQALCyACQdABaiQADwtBuJLAAEErQaSFwAAQcQALIAJBrQFqICk6AAAgAkGpAWogLDoAACACQaUBaiAvOgAAIAJBoQFqIDI6AAAgAkGdAWogNToAACACQZkBaiA4OgAAIAJBlQFqID46AAAgAkGuAWogKDoAACACQaoBaiArOgAAIAJBpgFqIC46AAAgAkGiAWogMToAACACQZ4BaiA0OgAAIAJBmgFqIDc6AAAgAkGWAWogPToAACACQa8BaiAnOgAAIAJBqwFqICo6AAAgAkGnAWogLToAACACQaMB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C4QhBwJAAkAgBEHwAHNBEEkNACABIAc3AHAgAUH4AGogCDcAACAAIAFBARAMDAELIAAgAUEBEAwgA0EAQfAAEI4BIgRB+ABqIAg3AAAgBCAHNwBwIAAgBEEBEAwLIAFBADoAgAEgAiAAKQMAIgdCOIYgB0KA/gODQiiGhCAHQoCA/AeDQhiGIAdCgICA+A+DQgiGhIQgB0IIiEKAgID4D4MgB0IYiEKAgPwHg4QgB0IoiEKA/gODIAdCOIiEhIQ3AAAgAiAAKQMIIgdCOIYgB0KA/gODQiiGhCAHQoCA/AeDQhiGIAdCgICA+A+DQgiGhIQgB0IIiEKAgID4D4MgB0IYiEKAgPwHg4QgB0IoiEKA/gODIAdCOIiEhIQ3AAggAiAAKQMQIgdCOIYgB0KA/gODQiiGhCAHQoCA/AeDQhiGIAdCgICA+A+DQgiGhIQgB0IIiEKAgID4D4MgB0IYiEKAgPwHg4QgB0IoiEKA/gODIAdCOIiEhIQ3ABAgAiAAKQMYIgdCOIYgB0KA/gODQiiGhCAHQoCA/AeDQhiGIAdCgICA+A+DQgiGhIQgB0IIiEKAgID4D4MgB0IYiEKAgPwHg4QgB0IoiEKA/gODIAdCOIiEhIQ3ABggAiAAKQMgIgdCOIYgB0KA/gODQiiGhCAHQoCA/AeDQhiGIAdCgICA+A+DQgiGhIQgB0IIiEKAgID4D4MgB0IYiEKAgPwHg4QgB0IoiEKA/gODIAdCOIiEhIQ3ACAgAiAAKQMoIgdCOIYgB0KA/gODQiiGhCAHQoCA/AeDQhiGIAdCgICA+A+DQgiGhIQgB0IIiEKAgID4D4MgB0IYiEKAgPwHg4QgB0IoiEKA/gODIAdCOIiEhIQ3ACggAiAAKQMwIgdCOIYgB0KA/gODQiiGhCAHQoCA/AeDQhiGIAdCgICA+A+DQgiGhIQgB0IIiEKAgID4D4MgB0IYiEKAgPwHg4QgB0IoiEKA/gODIAdCOIiEhIQ3ADAgAiAAKQM4IgdCOIYgB0KA/gODQiiGhCAHQoCA/AeDQhiGIAdCgICA+A+DQgiGhIQgB0IIiEKAgID4D4MgB0IYiEKAgPwHg4QgB0IoiEKA/gODIAdCOIiEhIQ3ADggA0GAAWokAAvQCAEIfwJAAkACQAJAAkACQCACQQlJDQAgAiADEDAiAg0BQQAPC0EAIQIgA0HM/3tLDQFBECADQQtqQXhxIANBC0kbIQEgAEF8aiIEKAIAIgVBeHEhBgJAAkACQAJAAkACQAJAAkACQAJAIAVBA3FFDQAgAEF4aiIHIAZqIQggBiABTw0BIAhBACgCyNdARg0IIAhBACgCxNdARg0GIAgoAgQiBUECcQ0JIAVBeHEiCSAGaiIKIAFJDQkgCiABayELIAlBgAJJDQUgCCgCGCEJIAgoAgwiAyAIRw0CIAhBFEEQIAhBFGoiAygCACIGG2ooAgAiAg0DQQAhAwwECyABQYACSQ0IIAYgAUEEckkNCCAGIAFrQYGACE8NCCAADwsgBiABayIDQRBPDQUgAA8LIAgoAggiAiADNgIMIAMgAjYCCAwBCyADIAhBEGogBhshBgNAIAYhBSACIgNBFGoiAiADQRBqIAIoAgAiAhshBiADQRRBECACG2ooAgAiAg0ACyAFQQA2AgALIAlFDQkCQCAIKAIcQQJ0QZzUwABqIgIoAgAgCEYNACAJQRBBFCAJKAIQIAhGG2ogAzYCACADRQ0KDAkLIAIgAzYCACADDQhBAEEAKAK410BBfiAIKAIcd3E2ArjXQAwJCwJAIAhBDGooAgAiAyAIQQhqKAIAIgJGDQAgAiADNgIMIAMgAjYCCAwJC0EAQQAoArTXQEF+IAVBA3Z3cTYCtNdADAgLQQAoArzXQCAGaiIGIAFJDQICQAJAIAYgAWsiA0EPSw0AIAQgBUEBcSAGckECcjYCACAHIAZqIgMgAygCBEEBcjYCBEEAIQNBACECDAELIAQgBUEBcSABckECcjYCACAHIAFqIgIgA0EBcjYCBCAHIAZqIgEgAzYCACABIAEoAgRBfnE2AgQLQQAgAjYCxNdAQQAgAzYCvNdAIAAPCyAEIAVBAXEgAXJBAnI2AgAgByABaiICIANBA3I2AgQgCCAIKAIEQQFyNgIEIAIgAxAkIAAPC0EAKALA10AgBmoiBiABSw0DCyADEBkiAUUNASABIABBfEF4IAQoAgAiAkEDcRsgAkF4cWoiAiADIAIgA0kbEJABIQMgABAgIAMPCyACIAAgASADIAEgA0kbEJABGiAAECALIAIPCyAEIAVBAXEgAXJBAnI2AgAgByABaiIDIAYgAWsiAkEBcjYCBEEAIAI2AsDXQEEAIAM2AsjXQCAADwsgAyAJNgIYAkAgCCgCECICRQ0AIAMgAjYCECACIAM2AhgLIAhBFGooAgAiAkUNACADQRRqIAI2AgAgAiADNgIYCwJAIAtBEEkNACAEIAQoAgBBAXEgAXJBAnI2AgAgByABaiIDIAtBA3I2AgQgByAKaiICIAIoAgRBAXI2AgQgAyALECQgAA8LIAQgBCgCAEEBcSAKckECcjYCACAHIApqIgMgAygCBEEBcjYCBCAAC9UGAgx/An4jAEEwayICJABBJyEDAkACQCAANQIAIg5CkM4AWg0AIA4hDwwBC0EnIQMDQCACQQlqIANqIgBBfGogDkKQzgCAIg9C8LEDfiAOfKciBEH//wNxQeQAbiIFQQF0QfiHwABqLwAAOwAAIABBfmogBUGcf2wgBGpB//8DcUEBdEH4h8AAai8AADsAACADQXxqIQMgDkL/wdcvViEAIA8hDiAADQALCwJAIA+nIgBB4wBNDQAgAkEJaiADQX5qIgNqIA+nIgRB//8DcUHkAG4iAEGcf2wgBGpB//8DcUEBdEH4h8AAai8AADsAAAsCQAJAIABBCkkNACACQQlqIANBfmoiA2ogAEEBdEH4h8AAai8AADsAAAwBCyACQQlqIANBf2oiA2ogAEEwajoAAAtBJyADayEGQQEhBUErQYCAxAAgASgCHCIAQQFxIgQbIQcgAEEddEEfdUG4ksAAcSEIIAJBCWogA2ohCQJAAkAgASgCAA0AIAEoAhQiAyABKAIYIgAgByAIEHINASADIAkgBiAAKAIMEQcAIQUMAQsCQCABKAIEIgogBCAGaiIFSw0AQQEhBSABKAIUIgMgASgCGCIAIAcgCBByDQEgAyAJIAYgACgCDBEHACEFDAELAkAgAEEIcUUNACABKAIQIQsgAUEwNgIQIAEtACAhDEEBIQUgAUEBOgAgIAEoAhQiACABKAIYIg0gByAIEHINASADIApqIARrQVpqIQMCQANAIANBf2oiA0UNASAAQTAgDSgCEBEFAEUNAAwDCwsgACAJIAYgDSgCDBEHAA0BIAEgDDoAICABIAs2AhBBACEFDAELIAogBWshCgJAAkACQCABLQAgIgMOBAIAAQACCyAKIQNBACEKDAELIApBAXYhAyAKQQFqQQF2IQoLIANBAWohAyABQRhqKAIAIQAgASgCECENIAEoAhQhBAJAA0AgA0F/aiIDRQ0BIAQgDSAAKAIQEQUARQ0AC0EBIQUMAQtBASEFIAQgACAHIAgQcg0AIAQgCSAGIAAoAgwRBwANAEEAIQMDQAJAIAogA0cNACAKIApJIQUMAgsgA0EBaiEDIAQgDSAAKAIQEQUARQ0ACyADQX9qIApJIQULIAJBMGokACAFC5AFAgR/A34jAEHAAGsiAyQAIAEgAS0AQCIEaiIFQYABOgAAIAApAyAiB0IBhkKAgID4D4MgB0IPiEKAgPwHg4QgB0IfiEKA/gODIAdCCYYiB0I4iISEIQggBK0iCUI7hiAHIAlCA4aEIgdCgP4Dg0IohoQgB0KAgPwHg0IYhiAHQoCAgPgPg0IIhoSEIQcCQCAEQT9zIgZFDQAgBUEBakEAIAYQjgEaCyAHIAiEIQcCQAJAIARBOHNBCEkNACABIAc3ADggACABQQEQDgwBCyAAIAFBARAOIANBMGpCADcDACADQShqQgA3AwAgA0EgakIANwMAIANBGGpCADcDACADQRBqQgA3AwAgA0EIakIANwMAIANCADcDACADIAc3AzggACADQQEQDgsgAUEAOgBAIAIgACgCACIBQRh0IAFBgP4DcUEIdHIgAUEIdkGA/gNxIAFBGHZycjYAACACIAAoAgQiAUEYdCABQYD+A3FBCHRyIAFBCHZBgP4DcSABQRh2cnI2AAQgAiAAKAIIIgFBGHQgAUGA/gNxQQh0ciABQQh2QYD+A3EgAUEYdnJyNgAIIAIgACgCDCIBQRh0IAFBgP4DcUEIdHIgAUEIdkGA/gNxIAFBGHZycjYADCACIAAoAhAiAUEYdCABQYD+A3FBCHRyIAFBCHZBgP4DcSABQRh2cnI2ABAgAiAAKAIUIgFBGHQgAUGA/gNxQQh0ciABQQh2QYD+A3EgAUEYdnJyNgAUIAIgACgCGCIBQRh0IAFBgP4DcUEIdHIgAUEIdkGA/gNxIAFBGHZycjYAGCACIAAoAhwiAEEYdCAAQYD+A3FBCHRyIABBCHZBgP4DcSAAQRh2cnI2ABwgA0HAAGokAAujBQEKfyMAQTBrIgMkACADQSRqIAE2AgAgA0EDOgAsIANBIDYCHEEAIQQgA0EANgIoIAMgADYCICADQQA2AhQgA0EANgIMAkACQAJAAkACQCACKAIQIgUNACACQQxqKAIAIgBFDQEgAigCCCEBIABBA3QhBiAAQX9qQf////8BcUEBaiEEIAIoAgAhAANAAkAgAEEEaigCACIHRQ0AIAMoAiAgACgCACAHIAMoAiQoAgwRBwANBAsgASgCACADQQxqIAFBBGooAgARBQANAyABQQhqIQEgAEEIaiEAIAZBeGoiBg0ADAILCyACQRRqKAIAIgFFDQAgAUEFdCEIIAFBf2pB////P3FBAWohBCACKAIIIQkgAigCACEAQQAhBgNAAkAgAEEEaigCACIBRQ0AIAMoAiAgACgCACABIAMoAiQoAgwRBwANAwsgAyAFIAZqIgFBEGooAgA2AhwgAyABQRxqLQAAOgAsIAMgAUEYaigCADYCKCABQQxqKAIAIQpBACELQQAhBwJAAkACQCABQQhqKAIADgMBAAIBCyAKQQN0IQxBACEHIAkgDGoiDCgCBEEERw0BIAwoAgAoAgAhCgtBASEHCyADIAo2AhAgAyAHNgIMIAFBBGooAgAhBwJAAkACQCABKAIADgMBAAIBCyAHQQN0IQogCSAKaiIKKAIEQQRHDQEgCigCACgCACEHC0EBIQsLIAMgBzYCGCADIAs2AhQgCSABQRRqKAIAQQN0aiIBKAIAIANBDGogASgCBBEFAA0CIABBCGohACAIIAZBIGoiBkcNAAsLIAQgAigCBE8NASADKAIgIAIoAgAgBEEDdGoiASgCACABKAIEIAMoAiQoAgwRBwBFDQELQQEhAQwBC0EAIQELIANBMGokACABC9AEAgN/A34jAEHgAGsiAyQAIAApAwAhBiABIAEtAEAiBGoiBUGAAToAACADQQhqQRBqIABBGGooAgA2AgAgA0EIakEIaiAAQRBqKQIANwMAIAMgACkCCDcDCCAGQgGGQoCAgPgPgyAGQg+IQoCA/AeDhCAGQh+IQoD+A4MgBkIJhiIGQjiIhIQhByAErSIIQjuGIAYgCEIDhoQiBkKA/gODQiiGhCAGQoCA/AeDQhiGIAZCgICA+A+DQgiGhIQhBgJAIARBP3MiAEUNACAFQQFqQQAgABCOARoLIAYgB4QhBgJAAkAgBEE4c0EISQ0AIAEgBjcAOCADQQhqIAFBARAUDAELIANBCGogAUEBEBQgA0HQAGpCADcDACADQcgAakIANwMAIANBwABqQgA3AwAgA0E4akIANwMAIANBMGpCADcDACADQShqQgA3AwAgA0IANwMgIAMgBjcDWCADQQhqIANBIGpBARAUCyABQQA6AEAgAiADKAIIIgFBGHQgAUGA/gNxQQh0ciABQQh2QYD+A3EgAUEYdnJyNgAAIAIgAygCDCIBQRh0IAFBgP4DcUEIdHIgAUEIdkGA/gNxIAFBGHZycjYABCACIAMoAhAiAUEYdCABQYD+A3FBCHRyIAFBCHZBgP4DcSABQRh2cnI2AAggAiADKAIUIgFBGHQgAUGA/gNxQQh0ciABQQh2QYD+A3EgAUEYdnJyNgAMIAIgAygCGCIBQRh0IAFBgP4DcUEIdHIgAUEIdkGA/gNxIAFBGHZycjYAECADQeAAaiQAC4gEAQp/IwBBMGsiBiQAQQAhByAGQQA2AggCQCABQUBxIghFDQBBASEHIAZBATYCCCAGIAA2AgAgCEHAAEYNAEECIQcgBkECNgIIIAYgAEHAAGo2AgQgCEGAAUYNACAGIABBgAFqNgIQQYySwAAgBkEQakHchsAAQbSEwAAQXwALIAFBP3EhCQJAIAcgBUEFdiIBIAcgAUkbIgFFDQAgA0EEciEKIAFBBXQhC0EAIQMgBiEMA0AgDCgCACEBIAZBEGpBGGoiDSACQRhqKQIANwMAIAZBEGpBEGoiDiACQRBqKQIANwMAIAZBEGpBCGoiDyACQQhqKQIANwMAIAYgAikCADcDECAGQRBqIAFBwABCACAKEBcgBCADaiIBQRhqIA0pAwA3AAAgAUEQaiAOKQMANwAAIAFBCGogDykDADcAACABIAYpAxA3AAAgDEEEaiEMIAsgA0EgaiIDRw0ACwsCQAJAAkACQCAJRQ0AIAUgB0EFdCICSQ0BIAUgAmsiAUEfTQ0CIAlBIEcNAyAEIAJqIgIgACAIaiIBKQAANwAAIAJBGGogAUEYaikAADcAACACQRBqIAFBEGopAAA3AAAgAkEIaiABQQhqKQAANwAAIAdBAWohBwsgBkEwaiQAIAcPCyACIAVBhITAABBhAAtBICABQZSEwAAQYAALQSAgCUGkhMAAEGIAC5gEAgt/A34jAEGgAWsiAiQAIAEgASkDQCABQcgBai0AACIDrXw3A0AgAUHIAGohBAJAIANBgAFGDQAgBCADakEAQYABIANrEI4BGgsgAUEAOgDIASABIARCfxAQIAJBIGpBCGoiAyABQQhqIgUpAwAiDTcDACACQSBqQRBqIgQgAUEQaiIGKQMAIg43AwAgAkEgakEYaiIHIAFBGGoiCCkDACIPNwMAIAJBIGpBIGogASkDIDcDACACQSBqQShqIAFBKGoiCSkDADcDACACQQhqIgogDTcDACACQRBqIgsgDjcDACACQRhqIgwgDzcDACACIAEpAwAiDTcDICACIA03AwAgAUEAOgDIASABQgA3A0AgAUE4akL5wvibkaOz8NsANwMAIAFBMGpC6/qG2r+19sEfNwMAIAlCn9j52cKR2oKbfzcDACABQtGFmu/6z5SH0QA3AyAgCELx7fT4paf9p6V/NwMAIAZCq/DT9K/uvLc8NwMAIAVCu86qptjQ67O7fzcDACABQqiS95X/zPmE6gA3AwAgByAMKQMANwMAIAQgCykDADcDACADIAopAwA3AwAgAiACKQMANwMgQQAtAIDYQBoCQEEgEBkiAQ0AAAsgASACKQMgNwAAIAFBGGogBykDADcAACABQRBqIAQpAwA3AAAgAUEIaiADKQMANwAAIABBIDYCBCAAIAE2AgAgAkGgAWokAAu/AwIGfwF+IwBBkANrIgIkACACQSBqIAFB0AEQkAEaIAIgAikDYCACQegBai0AACIDrXw3A2AgAkHoAGohBAJAIANBgAFGDQAgBCADakEAQYABIANrEI4BGgsgAkEAOgDoASACQSBqIARCfxAQIAJBkAJqQQhqIgMgAkEgakEIaikDADcDACACQZACakEQaiIEIAJBIGpBEGopAwA3AwAgAkGQAmpBGGoiBSACQSBqQRhqKQMANwMAIAJBkAJqQSBqIAIpA0A3AwAgAkGQAmpBKGogAkEgakEoaikDADcDACACQZACakEwaiACQSBqQTBqKQMANwMAIAJBkAJqQThqIAJBIGpBOGopAwA3AwAgAiACKQMgNwOQAiACQfABakEQaiAEKQMAIgg3AwAgAkEIaiIEIAMpAwA3AwAgAkEQaiIGIAg3AwAgAkEYaiIHIAUpAwA3AwAgAiACKQOQAjcDAEEALQCA2EAaAkBBIBAZIgMNAAALIAMgAikDADcAACADQRhqIAcpAwA3AAAgA0EQaiAGKQMANwAAIANBCGogBCkDADcAACABECAgAEEgNgIEIAAgAzYCACACQZADaiQAC6IDAQJ/AkACQAJAAkACQCAALQBoIgNFDQAgA0HBAE8NAyAAIANqIAFBwAAgA2siAyACIAMgAkkbIgMQkAEaIAAgAC0AaCADaiIEOgBoIAEgA2ohAQJAIAIgA2siAg0AQQAhAgwCCyAAQcAAaiAAQcAAIAApA2AgAC0AaiAALQBpRXIQFyAAQgA3AwAgAEEAOgBoIABBCGpCADcDACAAQRBqQgA3AwAgAEEYakIANwMAIABBIGpCADcDACAAQShqQgA3AwAgAEEwakIANwMAIABBOGpCADcDACAAIAAtAGlBAWo6AGkLQQAhAyACQcEASQ0BIABBwABqIQQgAC0AaSEDA0AgBCABQcAAIAApA2AgAC0AaiADQf8BcUVyEBcgACAALQBpQQFqIgM6AGkgAUHAAGohASACQUBqIgJBwABLDQALIAAtAGghBAsgBEH/AXEiA0HBAE8NAgsgACADaiABQcAAIANrIgMgAiADIAJJGyICEJABGiAAIAAtAGggAmo6AGggAA8LIANBwABB1IPAABBhAAsgA0HAAEHUg8AAEGEAC+8CAQV/QQAhAgJAQc3/eyAAQRAgAEEQSxsiAGsgAU0NACAAQRAgAUELakF4cSABQQtJGyIDakEMahAZIgFFDQAgAUF4aiECAkACQCAAQX9qIgQgAXENACACIQAMAQsgAUF8aiIFKAIAIgZBeHEgBCABakEAIABrcUF4aiIBQQAgACABIAJrQRBLG2oiACACayIBayEEAkAgBkEDcUUNACAAIAAoAgRBAXEgBHJBAnI2AgQgACAEaiIEIAQoAgRBAXI2AgQgBSAFKAIAQQFxIAFyQQJyNgIAIAIgAWoiBCAEKAIEQQFyNgIEIAIgARAkDAELIAIoAgAhAiAAIAQ2AgQgACACIAFqNgIACwJAIAAoAgQiAUEDcUUNACABQXhxIgIgA0EQak0NACAAIAFBAXEgA3JBAnI2AgQgACADaiIBIAIgA2siA0EDcjYCBCAAIAJqIgIgAigCBEEBcjYCBCABIAMQJAsgAEEIaiECCyACC7gDAQF/IAIgAi0AqAEiA2pBAEGoASADaxCOASEDIAJBADoAqAEgA0EfOgAAIAIgAi0ApwFBgAFyOgCnASABIAEpAwAgAikAAIU3AwAgASABKQMIIAIpAAiFNwMIIAEgASkDECACKQAQhTcDECABIAEpAxggAikAGIU3AxggASABKQMgIAIpACCFNwMgIAEgASkDKCACKQAohTcDKCABIAEpAzAgAikAMIU3AzAgASABKQM4IAIpADiFNwM4IAEgASkDQCACKQBAhTcDQCABIAEpA0ggAikASIU3A0ggASABKQNQIAIpAFCFNwNQIAEgASkDWCACKQBYhTcDWCABIAEpA2AgAikAYIU3A2AgASABKQNoIAIpAGiFNwNoIAEgASkDcCACKQBwhTcDcCABIAEpA3ggAikAeIU3A3ggASABKQOAASACKQCAAYU3A4ABIAEgASkDiAEgAikAiAGFNwOIASABIAEpA5ABIAIpAJABhTcDkAEgASABKQOYASACKQCYAYU3A5gBIAEgASkDoAEgAikAoAGFNwOgASABIAEoAsgBECUgACABQcgBEJABIAEoAsgBNgLIAQvtAgEEfyMAQeABayIDJAACQAJAAkACQCACDQBBASEEDAELIAJBf0wNASACEBkiBEUNAiAEQXxqLQAAQQNxRQ0AIARBACACEI4BGgsgA0EIaiABECEgA0GAAWpBCGpCADcDACADQYABakEQakIANwMAIANBgAFqQRhqQgA3AwAgA0GAAWpBIGpCADcDACADQagBakIANwMAIANBsAFqQgA3AwAgA0G4AWpCADcDACADQcgBaiABQQhqKQMANwMAIANB0AFqIAFBEGopAwA3AwAgA0HYAWogAUEYaikDADcDACADQgA3A4ABIAMgASkDADcDwAEgAUGKAWoiBS0AACEGIAFBIGogA0GAAWpB4AAQkAEaIAUgBjoAACABQYgBakEAOwEAIAFBgAFqQgA3AwACQCABQfAOaigCAEUNACABQQA2AvAOCyADQQhqIAQgAhAWIAAgAjYCBCAAIAQ2AgAgA0HgAWokAA8LEHMACwALlwMBAX8CQCACRQ0AIAEgAkGoAWxqIQMgACgCACECA0AgAiACKQMAIAEpAACFNwMAIAIgAikDCCABKQAIhTcDCCACIAIpAxAgASkAEIU3AxAgAiACKQMYIAEpABiFNwMYIAIgAikDICABKQAghTcDICACIAIpAyggASkAKIU3AyggAiACKQMwIAEpADCFNwMwIAIgAikDOCABKQA4hTcDOCACIAIpA0AgASkAQIU3A0AgAiACKQNIIAEpAEiFNwNIIAIgAikDUCABKQBQhTcDUCACIAIpA1ggASkAWIU3A1ggAiACKQNgIAEpAGCFNwNgIAIgAikDaCABKQBohTcDaCACIAIpA3AgASkAcIU3A3AgAiACKQN4IAEpAHiFNwN4IAIgAikDgAEgASkAgAGFNwOAASACIAIpA4gBIAEpAIgBhTcDiAEgAiACKQOQASABKQCQAYU3A5ABIAIgAikDmAEgASkAmAGFNwOYASACIAIpA6ABIAEpAKABhTcDoAEgAiACKALIARAlIAFBqAFqIgEgA0cNAAsLC5UDAgd/AX4jAEHgAGsiAiQAIAEgASkDICABQegAai0AACIDrXw3AyAgAUEoaiEEAkAgA0HAAEYNACAEIANqQQBBwAAgA2sQjgEaCyABQQA6AGggASAEQX8QEyACQSBqQQhqIgMgAUEIaiIEKQIAIgk3AwAgAkEIaiIFIAk3AwAgAkEQaiIGIAEpAhA3AwAgAkEYaiIHIAFBGGoiCCkCADcDACACIAEpAgAiCTcDICACIAk3AwAgAUEAOgBoIAFCADcDICAIQquzj/yRo7Pw2wA3AwAgAUL/pLmIxZHagpt/NwMQIARC8ua746On/aelfzcDACABQsfMo9jW0Ouzu383AwAgAkEgakEYaiIEIAcpAwA3AwAgAkEgakEQaiIHIAYpAwA3AwAgAyAFKQMANwMAIAIgAikDADcDIEEALQCA2EAaAkBBIBAZIgENAAALIAEgAikDIDcAACABQRhqIAQpAwA3AAAgAUEQaiAHKQMANwAAIAFBCGogAykDADcAACAAQSA2AgQgACABNgIAIAJB4ABqJAALkwMBAX8gASABLQCQASIDakEAQZABIANrEI4BIQMgAUEAOgCQASADQQE6AAAgASABLQCPAUGAAXI6AI8BIAAgACkDACABKQAAhTcDACAAIAApAwggASkACIU3AwggACAAKQMQIAEpABCFNwMQIAAgACkDGCABKQAYhTcDGCAAIAApAyAgASkAIIU3AyAgACAAKQMoIAEpACiFNwMoIAAgACkDMCABKQAwhTcDMCAAIAApAzggASkAOIU3AzggACAAKQNAIAEpAECFNwNAIAAgACkDSCABKQBIhTcDSCAAIAApA1AgASkAUIU3A1AgACAAKQNYIAEpAFiFNwNYIAAgACkDYCABKQBghTcDYCAAIAApA2ggASkAaIU3A2ggACAAKQNwIAEpAHCFNwNwIAAgACkDeCABKQB4hTcDeCAAIAApA4ABIAEpAIABhTcDgAEgACAAKQOIASABKQCIAYU3A4gBIAAgACgCyAEQJSACIAApAwA3AAAgAiAAKQMINwAIIAIgACkDEDcAECACIAApAxg+ABgLkwMBAX8gASABLQCQASIDakEAQZABIANrEI4BIQMgAUEAOgCQASADQQY6AAAgASABLQCPAUGAAXI6AI8BIAAgACkDACABKQAAhTcDACAAIAApAwggASkACIU3AwggACAAKQMQIAEpABCFNwMQIAAgACkDGCABKQAYhTcDGCAAIAApAyAgASkAIIU3AyAgACAAKQMoIAEpACiFNwMoIAAgACkDMCABKQAwhTcDMCAAIAApAzggASkAOIU3AzggACAAKQNAIAEpAECFNwNAIAAgACkDSCABKQBIhTcDSCAAIAApA1AgASkAUIU3A1AgACAAKQNYIAEpAFiFNwNYIAAgACkDYCABKQBghTcDYCAAIAApA2ggASkAaIU3A2ggACAAKQNwIAEpAHCFNwNwIAAgACkDeCABKQB4hTcDeCAAIAApA4ABIAEpAIABhTcDgAEgACAAKQOIASABKQCIAYU3A4gBIAAgACgCyAEQJSACIAApAwA3AAAgAiAAKQMINwAIIAIgACkDEDcAECACIAApAxg+ABgLwQIBCH8CQAJAIAJBEE8NACAAIQMMAQsgAEEAIABrQQNxIgRqIQUCQCAERQ0AIAAhAyABIQYDQCADIAYtAAA6AAAgBkEBaiEGIANBAWoiAyAFSQ0ACwsgBSACIARrIgdBfHEiCGohAwJAAkAgASAEaiIJQQNxRQ0AIAhBAUgNASAJQQN0IgZBGHEhAiAJQXxxIgpBBGohAUEAIAZrQRhxIQQgCigCACEGA0AgBSAGIAJ2IAEoAgAiBiAEdHI2AgAgAUEEaiEBIAVBBGoiBSADSQ0ADAILCyAIQQFIDQAgCSEBA0AgBSABKAIANgIAIAFBBGohASAFQQRqIgUgA0kNAAsLIAdBA3EhAiAJIAhqIQELAkAgAkUNACADIAJqIQUDQCADIAEtAAA6AAAgAUEBaiEBIANBAWoiAyAFSQ0ACwsgAAuAAwEBfyABIAEtAIgBIgNqQQBBiAEgA2sQjgEhAyABQQA6AIgBIANBBjoAACABIAEtAIcBQYABcjoAhwEgACAAKQMAIAEpAACFNwMAIAAgACkDCCABKQAIhTcDCCAAIAApAxAgASkAEIU3AxAgACAAKQMYIAEpABiFNwMYIAAgACkDICABKQAghTcDICAAIAApAyggASkAKIU3AyggACAAKQMwIAEpADCFNwMwIAAgACkDOCABKQA4hTcDOCAAIAApA0AgASkAQIU3A0AgACAAKQNIIAEpAEiFNwNIIAAgACkDUCABKQBQhTcDUCAAIAApA1ggASkAWIU3A1ggACAAKQNgIAEpAGCFNwNgIAAgACkDaCABKQBohTcDaCAAIAApA3AgASkAcIU3A3AgACAAKQN4IAEpAHiFNwN4IAAgACkDgAEgASkAgAGFNwOAASAAIAAoAsgBECUgAiAAKQMANwAAIAIgACkDCDcACCACIAApAxA3ABAgAiAAKQMYNwAYC4ADAQF/IAEgAS0AiAEiA2pBAEGIASADaxCOASEDIAFBADoAiAEgA0EBOgAAIAEgAS0AhwFBgAFyOgCHASAAIAApAwAgASkAAIU3AwAgACAAKQMIIAEpAAiFNwMIIAAgACkDECABKQAQhTcDECAAIAApAxggASkAGIU3AxggACAAKQMgIAEpACCFNwMgIAAgACkDKCABKQAohTcDKCAAIAApAzAgASkAMIU3AzAgACAAKQM4IAEpADiFNwM4IAAgACkDQCABKQBAhTcDQCAAIAApA0ggASkASIU3A0ggACAAKQNQIAEpAFCFNwNQIAAgACkDWCABKQBYhTcDWCAAIAApA2AgASkAYIU3A2AgACAAKQNoIAEpAGiFNwNoIAAgACkDcCABKQBwhTcDcCAAIAApA3ggASkAeIU3A3ggACAAKQOAASABKQCAAYU3A4ABIAAgACgCyAEQJSACIAApAwA3AAAgAiAAKQMINwAIIAIgACkDEDcAECACIAApAxg3ABgL7AIBAX8gAiACLQCIASIDakEAQYgBIANrEI4BIQMgAkEAOgCIASADQR86AAAgAiACLQCHAUGAAXI6AIcBIAEgASkDACACKQAAhTcDACABIAEpAwggAikACIU3AwggASABKQMQIAIpABCFNwMQIAEgASkDGCACKQAYhTcDGCABIAEpAyAgAikAIIU3AyAgASABKQMoIAIpACiFNwMoIAEgASkDMCACKQAwhTcDMCABIAEpAzggAikAOIU3AzggASABKQNAIAIpAECFNwNAIAEgASkDSCACKQBIhTcDSCABIAEpA1AgAikAUIU3A1AgASABKQNYIAIpAFiFNwNYIAEgASkDYCACKQBghTcDYCABIAEpA2ggAikAaIU3A2ggASABKQNwIAIpAHCFNwNwIAEgASkDeCACKQB4hTcDeCABIAEpA4ABIAIpAIABhTcDgAEgASABKALIARAlIAAgAUHIARCQASABKALIATYCyAEL3gIBAX8CQCACRQ0AIAEgAkGQAWxqIQMgACgCACECA0AgAiACKQMAIAEpAACFNwMAIAIgAikDCCABKQAIhTcDCCACIAIpAxAgASkAEIU3AxAgAiACKQMYIAEpABiFNwMYIAIgAikDICABKQAghTcDICACIAIpAyggASkAKIU3AyggAiACKQMwIAEpADCFNwMwIAIgAikDOCABKQA4hTcDOCACIAIpA0AgASkAQIU3A0AgAiACKQNIIAEpAEiFNwNIIAIgAikDUCABKQBQhTcDUCACIAIpA1ggASkAWIU3A1ggAiACKQNgIAEpAGCFNwNgIAIgAikDaCABKQBohTcDaCACIAIpA3AgASkAcIU3A3AgAiACKQN4IAEpAHiFNwN4IAIgAikDgAEgASkAgAGFNwOAASACIAIpA4gBIAEpAIgBhTcDiAEgAiACKALIARAlIAFBkAFqIgEgA0cNAAsLC7oCAgN/An4jAEHgAGsiAyQAIAApAwAhBiABIAEtAEAiBGoiBUGAAToAACADQQhqQRBqIABBGGooAgA2AgAgA0EIakEIaiAAQRBqKQIANwMAIAMgACkCCDcDCCAGQgmGIQYgBK1CA4YhBwJAIARBP3MiAEUNACAFQQFqQQAgABCOARoLIAYgB4QhBgJAAkAgBEE4c0EISQ0AIAEgBjcAOCADQQhqIAEQEgwBCyADQQhqIAEQEiADQdAAakIANwMAIANByABqQgA3AwAgA0HAAGpCADcDACADQThqQgA3AwAgA0EwakIANwMAIANBKGpCADcDACADQgA3AyAgAyAGNwNYIANBCGogA0EgahASCyABQQA6AEAgAiADKAIINgAAIAIgAykCDDcABCACIAMpAhQ3AAwgA0HgAGokAAvoAgIBfxV+AkAgAkUNACABIAJBqAFsaiEDA0AgACgCACICKQMAIQQgAikDCCEFIAIpAxAhBiACKQMYIQcgAikDICEIIAIpAyghCSACKQMwIQogAikDOCELIAIpA0AhDCACKQNIIQ0gAikDUCEOIAIpA1ghDyACKQNgIRAgAikDaCERIAIpA3AhEiACKQN4IRMgAikDgAEhFCACKQOIASEVIAIpA5ABIRYgAikDmAEhFyACKQOgASEYIAIgAigCyAEQJSABIBg3AKABIAEgFzcAmAEgASAWNwCQASABIBU3AIgBIAEgFDcAgAEgASATNwB4IAEgEjcAcCABIBE3AGggASAQNwBgIAEgDzcAWCABIA43AFAgASANNwBIIAEgDDcAQCABIAs3ADggASAKNwAwIAEgCTcAKCABIAg3ACAgASAHNwAYIAEgBjcAECABIAU3AAggASAENwAAIAFBqAFqIgEgA0cNAAsLC74CAQV/IAAoAhghAQJAAkACQCAAKAIMIgIgAEcNACAAQRRBECAAQRRqIgIoAgAiAxtqKAIAIgQNAUEAIQIMAgsgACgCCCIEIAI2AgwgAiAENgIIDAELIAIgAEEQaiADGyEDA0AgAyEFIAQiAkEUaiIEIAJBEGogBCgCACIEGyEDIAJBFEEQIAQbaigCACIEDQALIAVBADYCAAsCQCABRQ0AAkACQCAAKAIcQQJ0QZzUwABqIgQoAgAgAEYNACABQRBBFCABKAIQIABGG2ogAjYCACACDQEMAgsgBCACNgIAIAINAEEAQQAoArjXQEF+IAAoAhx3cTYCuNdADwsgAiABNgIYAkAgACgCECIERQ0AIAIgBDYCECAEIAI2AhgLIABBFGooAgAiBEUNACACQRRqIAQ2AgAgBCACNgIYDwsLwAICBX8CfiMAQfABayICJAAgAkEgaiABQfAAEJABGiACIAIpA0AgAkGIAWotAAAiA618NwNAIAJByABqIQQCQCADQcAARg0AIAQgA2pBAEHAACADaxCOARoLIAJBADoAiAEgAkEgaiAEQX8QEyACQZABakEIaiACQSBqQQhqKQMAIgc3AwAgAkGQAWpBGGogAkEgakEYaikDACIINwMAIAJBGGoiBCAINwMAIAJBEGoiBSACKQMwNwMAIAJBCGoiBiAHNwMAIAIgAikDICIHNwOwASACIAc3A5ABIAIgBzcDAEEALQCA2EAaAkBBIBAZIgMNAAALIAMgAikDADcAACADQRhqIAQpAwA3AAAgA0EQaiAFKQMANwAAIANBCGogBikDADcAACABECAgAEEgNgIEIAAgAzYCACACQfABaiQAC7gCAQN/IwBBgAZrIgMkAAJAAkACQAJAAkACQCACDQBBASEEDAELIAJBf0wNASACEBkiBEUNAiAEQXxqLQAAQQNxRQ0AIARBACACEI4BGgsgA0GAA2ogAUHQARCQARogA0HUBGogAUHQAWpBqQEQkAEaIAMgA0GAA2ogA0HUBGoQMSADQdABakEAQakBEI4BGiADIAM2AtQEIAIgAkGoAW4iBUGoAWwiAUkNAiADQdQEaiAEIAUQPQJAIAIgAUYNACADQYADakEAQagBEI4BGiADQdQEaiADQYADakEBED0gAiABayIFQakBTw0EIAQgAWogA0GAA2ogBRCQARoLIAAgAjYCBCAAIAQ2AgAgA0GABmokAA8LEHMACwALQfyLwABBI0Hci8AAEHEACyAFQagBQeyLwAAQYAALsgIBBH9BHyECAkAgAUH///8HSw0AIAFBBiABQQh2ZyICa3ZBAXEgAkEBdGtBPmohAgsgAEIANwIQIAAgAjYCHCACQQJ0QZzUwABqIQMCQAJAQQAoArjXQCIEQQEgAnQiBXENAEEAIAQgBXI2ArjXQCADIAA2AgAgACADNgIYDAELAkACQAJAIAMoAgAiBCgCBEF4cSABRw0AIAQhAgwBCyABQQBBGSACQQF2a0EfcSACQR9GG3QhAwNAIAQgA0EddkEEcWpBEGoiBSgCACICRQ0CIANBAXQhAyACIQQgAigCBEF4cSABRw0ACwsgAigCCCIDIAA2AgwgAiAANgIIIABBADYCGCAAIAI2AgwgACADNgIIDwsgBSAANgIAIAAgBDYCGAsgACAANgIMIAAgADYCCAvLAgEBfwJAIAJFDQAgASACQYgBbGohAyAAKAIAIQIDQCACIAIpAwAgASkAAIU3AwAgAiACKQMIIAEpAAiFNwMIIAIgAikDECABKQAQhTcDECACIAIpAxggASkAGIU3AxggAiACKQMgIAEpACCFNwMgIAIgAikDKCABKQAohTcDKCACIAIpAzAgASkAMIU3AzAgAiACKQM4IAEpADiFNwM4IAIgAikDQCABKQBAhTcDQCACIAIpA0ggASkASIU3A0ggAiACKQNQIAEpAFCFNwNQIAIgAikDWCABKQBYhTcDWCACIAIpA2AgASkAYIU3A2AgAiACKQNoIAEpAGiFNwNoIAIgAikDcCABKQBwhTcDcCACIAIpA3ggASkAeIU3A3ggAiACKQOAASABKQCAAYU3A4ABIAIgAigCyAEQJSABQYgBaiIBIANHDQALCwvNAgEBfyABIAEtAGgiA2pBAEHoACADaxCOASEDIAFBADoAaCADQQE6AAAgASABLQBnQYABcjoAZyAAIAApAwAgASkAAIU3AwAgACAAKQMIIAEpAAiFNwMIIAAgACkDECABKQAQhTcDECAAIAApAxggASkAGIU3AxggACAAKQMgIAEpACCFNwMgIAAgACkDKCABKQAohTcDKCAAIAApAzAgASkAMIU3AzAgACAAKQM4IAEpADiFNwM4IAAgACkDQCABKQBAhTcDQCAAIAApA0ggASkASIU3A0ggACAAKQNQIAEpAFCFNwNQIAAgACkDWCABKQBYhTcDWCAAIAApA2AgASkAYIU3A2AgACAAKALIARAlIAIgACkDADcAACACIAApAwg3AAggAiAAKQMQNwAQIAIgACkDGDcAGCACIAApAyA3ACAgAiAAKQMoNwAoC80CAQF/IAEgAS0AaCIDakEAQegAIANrEI4BIQMgAUEAOgBoIANBBjoAACABIAEtAGdBgAFyOgBnIAAgACkDACABKQAAhTcDACAAIAApAwggASkACIU3AwggACAAKQMQIAEpABCFNwMQIAAgACkDGCABKQAYhTcDGCAAIAApAyAgASkAIIU3AyAgACAAKQMoIAEpACiFNwMoIAAgACkDMCABKQAwhTcDMCAAIAApAzggASkAOIU3AzggACAAKQNAIAEpAECFNwNAIAAgACkDSCABKQBIhTcDSCAAIAApA1AgASkAUIU3A1AgACAAKQNYIAEpAFiFNwNYIAAgACkDYCABKQBghTcDYCAAIAAoAsgBECUgAiAAKQMANwAAIAIgACkDCDcACCACIAApAxA3ABAgAiAAKQMYNwAYIAIgACkDIDcAICACIAApAyg3ACgLrwIBA38jAEGwBGsiAyQAAkACQAJAAkACQAJAIAINAEEBIQQMAQsgAkF/TA0BIAIQGSIERQ0CIARBfGotAABBA3FFDQAgBEEAIAIQjgEaCyADIAEgAUHQAWoQMSABQQBByAEQjgEiAUH4AmpBADoAACABQRg2AsgBIANB0AFqQQBBqQEQjgEaIAMgAzYChAMgAiACQagBbiIFQagBbCIBSQ0CIANBhANqIAQgBRA9AkAgAiABRg0AIANBiANqQQBBqAEQjgEaIANBhANqIANBiANqQQEQPSACIAFrIgVBqQFPDQQgBCABaiADQYgDaiAFEJABGgsgACACNgIEIAAgBDYCACADQbAEaiQADwsQcwALAAtB/IvAAEEjQdyLwAAQcQALIAVBqAFB7IvAABBgAAutAgEFfyMAQcAAayICJAAgAkEgakEYaiIDQgA3AwAgAkEgakEQaiIEQgA3AwAgAkEgakEIaiIFQgA3AwAgAkIANwMgIAEgAUEoaiACQSBqECkgAkEYaiIGIAMpAwA3AwAgAkEQaiIDIAQpAwA3AwAgAkEIaiIEIAUpAwA3AwAgAiACKQMgNwMAIAFBGGpBACkD8IxANwMAIAFBEGpBACkD6IxANwMAIAFBCGpBACkD4IxANwMAIAFBACkD2IxANwMAIAFB6ABqQQA6AAAgAUIANwMgQQAtAIDYQBoCQEEgEBkiAQ0AAAsgASACKQMANwAAIAFBGGogBikDADcAACABQRBqIAMpAwA3AAAgAUEIaiAEKQMANwAAIABBIDYCBCAAIAE2AgAgAkHAAGokAAuNAgIDfwF+IwBB0ABrIgckACAFIAUtAEAiCGoiCUGAAToAACAHIAM2AgwgByACNgIIIAcgATYCBCAHIAA2AgAgBEIJhiEEIAitQgOGIQoCQCAIQT9zIgNFDQAgCUEBakEAIAMQjgEaCyAKIASEIQQCQAJAIAhBOHNBCEkNACAFIAQ3ADggByAFECMMAQsgByAFECMgB0HAAGpCADcDACAHQThqQgA3AwAgB0EwakIANwMAIAdBKGpCADcDACAHQSBqQgA3AwAgB0EQakEIakIANwMAIAdCADcDECAHIAQ3A0ggByAHQRBqECMLIAVBADoAQCAGIAcpAwA3AAAgBiAHKQMINwAIIAdB0ABqJAALjQICA38BfiMAQdAAayIHJAAgBSAFLQBAIghqIglBgAE6AAAgByADNgIMIAcgAjYCCCAHIAE2AgQgByAANgIAIARCCYYhBCAIrUIDhiEKAkAgCEE/cyIDRQ0AIAlBAWpBACADEI4BGgsgCiAEhCEEAkACQCAIQThzQQhJDQAgBSAENwA4IAcgBRAcDAELIAcgBRAcIAdBwABqQgA3AwAgB0E4akIANwMAIAdBMGpCADcDACAHQShqQgA3AwAgB0EgakIANwMAIAdBEGpBCGpCADcDACAHQgA3AxAgByAENwNIIAcgB0EQahAcCyAFQQA6AEAgBiAHKQMANwAAIAYgBykDCDcACCAHQdAAaiQAC6gCAgF/EX4CQCACRQ0AIAEgAkGIAWxqIQMDQCAAKAIAIgIpAwAhBCACKQMIIQUgAikDECEGIAIpAxghByACKQMgIQggAikDKCEJIAIpAzAhCiACKQM4IQsgAikDQCEMIAIpA0ghDSACKQNQIQ4gAikDWCEPIAIpA2AhECACKQNoIREgAikDcCESIAIpA3ghEyACKQOAASEUIAIgAigCyAEQJSABIBQ3AIABIAEgEzcAeCABIBI3AHAgASARNwBoIAEgEDcAYCABIA83AFggASAONwBQIAEgDTcASCABIAw3AEAgASALNwA4IAEgCjcAMCABIAk3ACggASAINwAgIAEgBzcAGCABIAY3ABAgASAFNwAIIAEgBDcAACABQYgBaiIBIANHDQALCwuEAgIEfwJ+IwBBwABrIgMkACABIAEtAEAiBGoiBUEBOgAAIAApAwBCCYYhByAErUIDhiEIAkAgBEE/cyIGRQ0AIAVBAWpBACAGEI4BGgsgByAIhCEHAkACQCAEQThzQQhJDQAgASAHNwA4IABBCGogARAVDAELIABBCGoiBCABEBUgA0EwakIANwMAIANBKGpCADcDACADQSBqQgA3AwAgA0EYakIANwMAIANBEGpCADcDACADQQhqQgA3AwAgA0IANwMAIAMgBzcDOCAEIAMQFQsgAUEAOgBAIAIgACkDCDcAACACIABBEGopAwA3AAggAiAAQRhqKQMANwAQIANBwABqJAALoQIBAX8gASABLQBIIgNqQQBByAAgA2sQjgEhAyABQQA6AEggA0EBOgAAIAEgAS0AR0GAAXI6AEcgACAAKQMAIAEpAACFNwMAIAAgACkDCCABKQAIhTcDCCAAIAApAxAgASkAEIU3AxAgACAAKQMYIAEpABiFNwMYIAAgACkDICABKQAghTcDICAAIAApAyggASkAKIU3AyggACAAKQMwIAEpADCFNwMwIAAgACkDOCABKQA4hTcDOCAAIAApA0AgASkAQIU3A0AgACAAKALIARAlIAIgACkDADcAACACIAApAwg3AAggAiAAKQMQNwAQIAIgACkDGDcAGCACIAApAyA3ACAgAiAAKQMoNwAoIAIgACkDMDcAMCACIAApAzg3ADgLoQIBAX8gASABLQBIIgNqQQBByAAgA2sQjgEhAyABQQA6AEggA0EGOgAAIAEgAS0AR0GAAXI6AEcgACAAKQMAIAEpAACFNwMAIAAgACkDCCABKQAIhTcDCCAAIAApAxAgASkAEIU3AxAgACAAKQMYIAEpABiFNwMYIAAgACkDICABKQAghTcDICAAIAApAyggASkAKIU3AyggACAAKQMwIAEpADCFNwMwIAAgACkDOCABKQA4hTcDOCAAIAApA0AgASkAQIU3A0AgACAAKALIARAlIAIgACkDADcAACACIAApAwg3AAggAiAAKQMQNwAQIAIgACkDGDcAGCACIAApAyA3ACAgAiAAKQMoNwAoIAIgACkDMDcAMCACIAApAzg3ADgLgAIBBX8jAEHAAGsiAiQAIAJBIGpBGGoiA0IANwMAIAJBIGpBEGoiBEIANwMAIAJBIGpBCGoiBUIANwMAIAJCADcDICABIAFB0AFqIAJBIGoQOSABQQBByAEQjgEiAUHYAmpBADoAACABQRg2AsgBIAJBCGoiBiAFKQMANwMAIAJBEGoiBSAEKQMANwMAIAJBGGoiBCADKQMANwMAIAIgAikDIDcDAEEALQCA2EAaAkBBIBAZIgENAAALIAEgAikDADcAACABQRhqIAQpAwA3AAAgAUEQaiAFKQMANwAAIAFBCGogBikDADcAACAAQSA2AgQgACABNgIAIAJBwABqJAALgAIBBX8jAEHAAGsiAiQAIAJBIGpBGGoiA0IANwMAIAJBIGpBEGoiBEIANwMAIAJBIGpBCGoiBUIANwMAIAJCADcDICABIAFB0AFqIAJBIGoQOCABQQBByAEQjgEiAUHYAmpBADoAACABQRg2AsgBIAJBCGoiBiAFKQMANwMAIAJBEGoiBSAEKQMANwMAIAJBGGoiBCADKQMANwMAIAIgAikDIDcDAEEALQCA2EAaAkBBIBAZIgENAAALIAEgAikDADcAACABQRhqIAQpAwA3AAAgAUEQaiAFKQMANwAAIAFBCGogBikDADcAACAAQSA2AgQgACABNgIAIAJBwABqJAAL/gEBBn8jAEGgA2siAiQAIAJBIGogAUHgAhCQARogAkGAA2pBGGoiA0IANwMAIAJBgANqQRBqIgRCADcDACACQYADakEIaiIFQgA3AwAgAkIANwOAAyACQSBqIAJB8AFqIAJBgANqEDkgAkEYaiIGIAMpAwA3AwAgAkEQaiIHIAQpAwA3AwAgAkEIaiIEIAUpAwA3AwAgAiACKQOAAzcDAEEALQCA2EAaAkBBIBAZIgMNAAALIAMgAikDADcAACADQRhqIAYpAwA3AAAgA0EQaiAHKQMANwAAIANBCGogBCkDADcAACABECAgAEEgNgIEIAAgAzYCACACQaADaiQAC/4BAQZ/IwBBsAFrIgIkACACQSBqIAFB8AAQkAEaIAJBkAFqQRhqIgNCADcDACACQZABakEQaiIEQgA3AwAgAkGQAWpBCGoiBUIANwMAIAJCADcDkAEgAkEgaiACQcgAaiACQZABahApIAJBGGoiBiADKQMANwMAIAJBEGoiByAEKQMANwMAIAJBCGoiBCAFKQMANwMAIAIgAikDkAE3AwBBAC0AgNhAGgJAQSAQGSIDDQAACyADIAIpAwA3AAAgA0EYaiAGKQMANwAAIANBEGogBykDADcAACADQQhqIAQpAwA3AAAgARAgIABBIDYCBCAAIAM2AgAgAkGwAWokAAv+AQEGfyMAQaADayICJAAgAkEgaiABQeACEJABGiACQYADakEYaiIDQgA3AwAgAkGAA2pBEGoiBEIANwMAIAJBgANqQQhqIgVCADcDACACQgA3A4ADIAJBIGogAkHwAWogAkGAA2oQOCACQRhqIgYgAykDADcDACACQRBqIgcgBCkDADcDACACQQhqIgQgBSkDADcDACACIAIpA4ADNwMAQQAtAIDYQBoCQEEgEBkiAw0AAAsgAyACKQMANwAAIANBGGogBikDADcAACADQRBqIAcpAwA3AAAgA0EIaiAEKQMANwAAIAEQICAAQSA2AgQgACADNgIAIAJBoANqJAALiAIBAX8CQCACRQ0AIAEgAkHoAGxqIQMgACgCACECA0AgAiACKQMAIAEpAACFNwMAIAIgAikDCCABKQAIhTcDCCACIAIpAxAgASkAEIU3AxAgAiACKQMYIAEpABiFNwMYIAIgAikDICABKQAghTcDICACIAIpAyggASkAKIU3AyggAiACKQMwIAEpADCFNwMwIAIgAikDOCABKQA4hTcDOCACIAIpA0AgASkAQIU3A0AgAiACKQNIIAEpAEiFNwNIIAIgAikDUCABKQBQhTcDUCACIAIpA1ggASkAWIU3A1ggAiACKQNgIAEpAGCFNwNgIAIgAigCyAEQJSABQegAaiIBIANHDQALCwvuAQEHfyMAQRBrIgMkACACEAIhBCACEAMhBSACEAQhBgJAAkAgBEGBgARJDQBBACEHIAQhCANAIANBBGogBiAFIAdqIAhBgIAEIAhBgIAESRsQBSIJEFwCQCAJQYQBSQ0AIAkQAQsgACABIAMoAgQiCSADKAIMEA8CQCADKAIIRQ0AIAkQIAsgCEGAgHxqIQggB0GAgARqIgcgBEkNAAwCCwsgA0EEaiACEFwgACABIAMoAgQiCCADKAIMEA8gAygCCEUNACAIECALAkAgBkGEAUkNACAGEAELAkAgAkGEAUkNACACEAELIANBEGokAAvfAQEDfyMAQSBrIgYkACAGQRRqIAEgAhAaAkACQCAGKAIUDQAgBkEcaigCACEHIAYoAhghCAwBCyAGKAIYIAZBHGooAgAQACEHQRshCAsCQCACRQ0AIAEQIAsCQAJAAkAgCEEbRw0AIANBhAFJDQEgAxABDAELIAggByADEFMgBkEIaiAIIAcgBEEARyAFEF4gBigCDCEHIAYoAggiAkUNAEEAIQggByEBQQAhBwwBC0EBIQhBACECQQAhAQsgACAINgIMIAAgBzYCCCAAIAE2AgQgACACNgIAIAZBIGokAAvLAQECfyMAQdAAayICQQA2AkxBQCEDA0AgAkEMaiADakHAAGogASADakHAAGooAAA2AgAgA0EEaiIDDQALIAAgAikCDDcAACAAQThqIAJBDGpBOGopAgA3AAAgAEEwaiACQQxqQTBqKQIANwAAIABBKGogAkEMakEoaikCADcAACAAQSBqIAJBDGpBIGopAgA3AAAgAEEYaiACQQxqQRhqKQIANwAAIABBEGogAkEMakEQaikCADcAACAAQQhqIAJBDGpBCGopAgA3AAALtQEBA38CQAJAIAJBEE8NACAAIQMMAQsgAEEAIABrQQNxIgRqIQUCQCAERQ0AIAAhAwNAIAMgAToAACADQQFqIgMgBUkNAAsLIAUgAiAEayIEQXxxIgJqIQMCQCACQQFIDQAgAUH/AXFBgYKECGwhAgNAIAUgAjYCACAFQQRqIgUgA0kNAAsLIARBA3EhAgsCQCACRQ0AIAMgAmohBQNAIAMgAToAACADQQFqIgMgBUkNAAsLIAALvgEBBH8jAEEQayIDJAAgA0EEaiABIAIQGgJAAkAgAygCBA0AIANBDGooAgAhBCADKAIIIQUMAQsgAygCCCADQQxqKAIAEAAhBEEbIQULAkAgAkUNACABECALQQAhAgJAAkACQCAFQRtGIgFFDQAgBCEGDAELQQAhBkEALQCA2EAaQQwQGSICRQ0BIAIgBDYCCCACIAU2AgQgAkEANgIACyAAIAY2AgQgACACNgIAIAAgATYCCCADQRBqJAAPCwALyAEBAX8CQCACRQ0AIAEgAkHIAGxqIQMgACgCACECA0AgAiACKQMAIAEpAACFNwMAIAIgAikDCCABKQAIhTcDCCACIAIpAxAgASkAEIU3AxAgAiACKQMYIAEpABiFNwMYIAIgAikDICABKQAghTcDICACIAIpAyggASkAKIU3AyggAiACKQMwIAEpADCFNwMwIAIgAikDOCABKQA4hTcDOCACIAIpA0AgASkAQIU3A0AgAiACKALIARAlIAFByABqIgEgA0cNAAsLC7YBAQN/IwBBEGsiBCQAAkACQCABRQ0AIAEoAgANASABQX82AgAgBEEEaiABQQRqKAIAIAFBCGooAgAgAkEARyADEBEgBEEEakEIaigCACEDIAQoAgghAgJAAkAgBCgCBA0AQQAhBUEAIQYMAQsgAiADEAAhBUEBIQZBACECQQAhAwsgAUEANgIAIAAgBjYCDCAAIAU2AgggACADNgIEIAAgAjYCACAEQRBqJAAPCxCKAQALEIsBAAutAQEEfyMAQRBrIgQkAAJAAkAgAUUNACABKAIADQFBACEFIAFBADYCACABQQhqKAIAIQYgASgCBCEHIAEQICAEQQhqIAcgBiACQQBHIAMQXiAEKAIMIQECQAJAIAQoAggiAg0AQQEhA0EAIQIMAQtBACEDIAIhBSABIQJBACEBCyAAIAM2AgwgACABNgIIIAAgAjYCBCAAIAU2AgAgBEEQaiQADwsQigEACxCLAQALkgEBAn8jAEGAAWsiAyQAAkACQAJAAkAgAg0AQQEhBAwBCyACQX9MDQEgAhAZIgRFDQIgBEF8ai0AAEEDcUUNACAEQQAgAhCOARoLIANBCGogARAhAkAgAUHwDmooAgBFDQAgAUEANgLwDgsgA0EIaiAEIAIQFiAAIAI2AgQgACAENgIAIANBgAFqJAAPCxBzAAsAC5MBAQV/AkACQAJAAkAgARAGIgINAEEBIQMMAQsgAkF/TA0BQQAtAIDYQBogAhAZIgNFDQILEAciBBAIIgUQCSEGAkAgBUGEAUkNACAFEAELIAYgASADEAoCQCAGQYQBSQ0AIAYQAQsCQCAEQYQBSQ0AIAQQAQsgACABEAY2AgggACACNgIEIAAgAzYCAA8LEHMACwALkAEBAX8jAEEQayIGJAACQAJAIAFFDQAgBkEEaiABIAMgBCAFIAIoAhARCgAgBigCBCEBAkAgBigCCCIEIAYoAgwiBU0NAAJAIAUNACABECBBBCEBDAELIAEgBEECdEEEIAVBAnQQJyIBRQ0CCyAAIAU2AgQgACABNgIAIAZBEGokAA8LQeiOwABBMhCMAQALAAuJAQEBfyMAQRBrIgUkACAFQQRqIAEgAiADIAQQESAFQQxqKAIAIQQgBSgCCCEDAkACQCAFKAIEDQAgACAENgIEIAAgAzYCAAwBCyADIAQQACEEIABBADYCACAAIAQ2AgQLAkAgAUEHRw0AIAJB8A5qKAIARQ0AIAJBADYC8A4LIAIQICAFQRBqJAALhAEBAX8jAEHAAGsiBCQAIARBKzYCDCAEIAA2AgggBCACNgIUIAQgATYCECAEQRhqQQxqQgI3AgAgBEEwakEMakEBNgIAIARBAjYCHCAEQeiHwAA2AhggBEECNgI0IAQgBEEwajYCICAEIARBEGo2AjggBCAEQQhqNgIwIARBGGogAxB0AAtyAQF/IwBBMGsiAyQAIAMgADYCACADIAE2AgQgA0EIakEMakICNwIAIANBIGpBDGpBAzYCACADQQI2AgwgA0GUisAANgIIIANBAzYCJCADIANBIGo2AhAgAyADQQRqNgIoIAMgAzYCICADQQhqIAIQdAALcgEBfyMAQTBrIgMkACADIAA2AgAgAyABNgIEIANBCGpBDGpCAjcCACADQSBqQQxqQQM2AgAgA0ECNgIMIANB9InAADYCCCADQQM2AiQgAyADQSBqNgIQIAMgA0EEajYCKCADIAM2AiAgA0EIaiACEHQAC3IBAX8jAEEwayIDJAAgAyABNgIEIAMgADYCACADQQhqQQxqQgI3AgAgA0EgakEMakEDNgIAIANBAzYCDCADQeSKwAA2AgggA0EDNgIkIAMgA0EgajYCECADIAM2AiggAyADQQRqNgIgIANBCGogAhB0AAtyAQF/IwBBMGsiAyQAIAMgATYCBCADIAA2AgAgA0EIakEMakICNwIAIANBIGpBDGpBAzYCACADQQI2AgwgA0HUh8AANgIIIANBAzYCJCADIANBIGo2AhAgAyADNgIoIAMgA0EEajYCICADQQhqIAIQdAALYwECfyMAQSBrIgIkACACQQxqQgE3AgAgAkEBNgIEIAJBtIbAADYCACACQQI2AhwgAkHUhsAANgIYIAFBGGooAgAhAyACIAJBGGo2AgggASgCFCADIAIQKiEBIAJBIGokACABC2MBAn8jAEEgayICJAAgAkEMakIBNwIAIAJBATYCBCACQbSGwAA2AgAgAkECNgIcIAJB1IbAADYCGCABQRhqKAIAIQMgAiACQRhqNgIIIAEoAhQgAyACECohASACQSBqJAAgAQtdAQJ/AkACQCAARQ0AIAAoAgANASAAQQA2AgAgAEEIaigCACEBIAAoAgQhAiAAECACQCACQQdHDQAgAUHwDmooAgBFDQAgAUEANgLwDgsgARAgDwsQigEACxCLAQALWAECfyMAQZABayICJAAgAkEANgKMAUGAfyEDA0AgAkEMaiADakGAAWogASADakGAAWooAAA2AgAgA0EEaiIDDQALIAAgAkEMakGAARCQARogAkGQAWokAAtYAQJ/IwBBoAFrIgIkACACQQA2ApwBQfB+IQMDQCACQQxqIANqQZABaiABIANqQZABaigAADYCACADQQRqIgMNAAsgACACQQxqQZABEJABGiACQaABaiQAC1gBAn8jAEGQAWsiAiQAIAJBADYCjAFB+H4hAwNAIAJBBGogA2pBiAFqIAEgA2pBiAFqKAAANgIAIANBBGoiAw0ACyAAIAJBBGpBiAEQkAEaIAJBkAFqJAALVwECfyMAQfAAayICJAAgAkEANgJsQZh/IQMDQCACQQRqIANqQegAaiABIANqQegAaigAADYCACADQQRqIgMNAAsgACACQQRqQegAEJABGiACQfAAaiQAC1cBAn8jAEHQAGsiAiQAIAJBADYCTEG4fyEDA0AgAkEEaiADakHIAGogASADakHIAGooAAA2AgAgA0EEaiIDDQALIAAgAkEEakHIABCQARogAkHQAGokAAtYAQJ/IwBBsAFrIgIkACACQQA2AqwBQdh+IQMDQCACQQRqIANqQagBaiABIANqQagBaigAADYCACADQQRqIgMNAAsgACACQQRqQagBEJABGiACQbABaiQAC2YBAX9BAEEAKAKY1EAiAkEBajYCmNRAAkAgAkEASA0AQQAtAOTXQEEBcQ0AQQBBAToA5NdAQQBBACgC4NdAQQFqNgLg10BBACgClNRAQX9MDQBBAEEAOgDk10AgAEUNABCRAQALAAtRAAJAIAFpQQFHDQBBgICAgHggAWsgAEkNAAJAIABFDQBBAC0AgNhAGgJAAkAgAUEJSQ0AIAEgABAwIQEMAQsgABAZIQELIAFFDQELIAEPCwALSgEDf0EAIQMCQCACRQ0AAkADQCAALQAAIgQgAS0AACIFRw0BIABBAWohACABQQFqIQEgAkF/aiICRQ0CDAALCyAEIAVrIQMLIAMLRgACQAJAIAFFDQAgASgCAA0BIAFBfzYCACABQQRqKAIAIAFBCGooAgAgAhBTIAFBADYCACAAQgA3AwAPCxCKAQALEIsBAAtHAQF/IwBBIGsiAyQAIANBDGpCADcCACADQQE2AgQgA0G4ksAANgIIIAMgATYCHCADIAA2AhggAyADQRhqNgIAIAMgAhB0AAtCAQF/AkACQAJAIAJBgIDEAEYNAEEBIQQgACACIAEoAhARBQANAQsgAw0BQQAhBAsgBA8LIAAgA0EAIAEoAgwRBwALPwEBfyMAQSBrIgAkACAAQRRqQgA3AgAgAEEBNgIMIABBtILAADYCCCAAQbiSwAA2AhAgAEEIakG8gsAAEHQACz4BAX8jAEEgayICJAAgAkEBOwEcIAIgATYCGCACIAA2AhQgAkGQh8AANgIQIAJBuJLAADYCDCACQQxqEHgACzwBAX8gAEEMaigCACECAkACQCAAKAIEDgIAAAELIAINACABLQAQIAEtABEQbQALIAEtABAgAS0AERBtAAsvAAJAAkAgA2lBAUcNAEGAgICAeCADayABSQ0AIAAgASADIAIQJyIDDQELAAsgAwsmAAJAIAANAEHojsAAQTIQjAEACyAAIAIgAyAEIAUgASgCEBELAAsnAQF/AkAgACgCCCIBDQBBuJLAAEErQYCTwAAQcQALIAEgABCNAQALJAACQCAADQBB6I7AAEEyEIwBAAsgACACIAMgBCABKAIQEQkACyQAAkAgAA0AQeiOwABBMhCMAQALIAAgAiADIAQgASgCEBEIAAskAAJAIAANAEHojsAAQTIQjAEACyAAIAIgAyAEIAEoAhARCQALJAACQCAADQBB6I7AAEEyEIwBAAsgACACIAMgBCABKAIQEQgACyQAAkAgAA0AQeiOwABBMhCMAQALIAAgAiADIAQgASgCEBEIAAskAAJAIAANAEHojsAAQTIQjAEACyAAIAIgAyAEIAEoAhARFwALJAACQCAADQBB6I7AAEEyEIwBAAsgACACIAMgBCABKAIQERgACyQAAkAgAA0AQeiOwABBMhCMAQALIAAgAiADIAQgASgCEBEWAAsiAAJAIAANAEHojsAAQTIQjAEACyAAIAIgAyABKAIQEQYACyAAAkAgAA0AQeiOwABBMhCMAQALIAAgAiABKAIQEQUACxQAIAAoAgAgASAAKAIEKAIMEQUACxAAIAEgACgCACAAKAIEEB8LIQAgAEKYo6rL4I761NYANwMIIABCq6qJm/b22twaNwMACw4AAkAgAUUNACAAECALCxEAQcyCwABBL0HYjsAAEHEACw0AIAAoAgAaA38MAAsLCwAgACMAaiQAIwALDQBBqNPAAEEbEIwBAAsOAEHD08AAQc8AEIwBAAsJACAAIAEQCwALCQAgACABEHUACwoAIAAgASACEFYLCgAgACABIAIQbwsKACAAIAEgAhA3CwMAAAsCAAsCAAsCAAsLnFQBAEGAgMAAC5JUfAUQAGAAAACuAAAAFAAAAEJMQUtFMkJCTEFLRTJCLTEyOEJMQUtFMkItMTYwQkxBS0UyQi0yMjRCTEFLRTJCLTI1NkJMQUtFMkItMzg0QkxBS0UyU0JMQUtFM0tFQ0NBSy0yMjRLRUNDQUstMjU2S0VDQ0FLLTM4NEtFQ0NBSy01MTJNRDRNRDVSSVBFTUQtMTYwU0hBLTFTSEEtMjI0U0hBLTI1NlNIQS0zODRTSEEtNTEyVElHRVJ1bnN1cHBvcnRlZCBhbGdvcml0aG1ub24tZGVmYXVsdCBsZW5ndGggc3BlY2lmaWVkIGZvciBub24tZXh0ZW5kYWJsZSBhbGdvcml0aG1saWJyYXJ5L2FsbG9jL3NyYy9yYXdfdmVjLnJzY2FwYWNpdHkgb3ZlcmZsb3cjARAAEQAAAAcBEAAcAAAAFgIAAAUAAABBcnJheVZlYzogY2FwYWNpdHkgZXhjZWVkZWQgaW4gZXh0ZW5kL2Zyb21faXRlci9Vc2Vycy9hc2hlci8uY2FyZ28vcmVnaXN0cnkvc3JjL2luZGV4LmNyYXRlcy5pby02ZjE3ZDIyYmJhMTUwMDFmL2JsYWtlMy0xLjUuMC9zcmMvbGliLnJzewEQAFkAAADYAQAAEQAAAHsBEABZAAAAfgIAAAoAAAB7ARAAWQAAAGoCAAAWAAAAewEQAFkAAACsAgAADAAAAHsBEABZAAAArAIAACgAAAB7ARAAWQAAAKwCAAA0AAAAewEQAFkAAACcAgAAFwAAAHsBEABZAAAA2AIAAB8AAAB7ARAAWQAAAPUCAAAMAAAAewEQAFkAAAD8AgAAEgAAAHsBEABZAAAAIAMAACEAAAB7ARAAWQAAACIDAAARAAAAewEQAFkAAAAiAwAAQQAAAHsBEABZAAAAEgQAADIAAAB7ARAAWQAAABoEAAAbAAAAewEQAFkAAABBBAAAFwAAAHsBEABZAAAApQQAABsAAAB7ARAAWQAAALcEAAAbAAAAewEQAFkAAADoBAAAEgAAAHsBEABZAAAA8gQAABIAAAB7ARAAWQAAAB8GAAAmAAAAQ2FwYWNpdHlFcnJvcjogACQDEAAPAAAAaW5zdWZmaWNpZW50IGNhcGFjaXR5AAAAPAMQABUAAAARAAAABAAAAAQAAAASAAAAEwAAACAAAAABAAAAFAAAABEAAAAEAAAABAAAABIAAAApAAAAFQAAAAAAAAABAAAAFgAAAGluZGV4IG91dCBvZiBib3VuZHM6IHRoZSBsZW4gaXMgIGJ1dCB0aGUgaW5kZXggaXMgAACgAxAAIAAAAMADEAASAAAAOiAAADgJEAAAAAAA5AMQAAIAAAAwMDAxMDIwMzA0MDUwNjA3MDgwOTEwMTExMjEzMTQxNTE2MTcxODE5MjAyMTIyMjMyNDI1MjYyNzI4MjkzMDMxMzIzMzM0MzUzNjM3MzgzOTQwNDE0MjQzNDQ0NTQ2NDc0ODQ5NTA1MTUyNTM1NDU1NTY1NzU4NTk2MDYxNjI2MzY0NjU2NjY3Njg2OTcwNzE3MjczNzQ3NTc2Nzc3ODc5ODA4MTgyODM4NDg1ODY4Nzg4ODk5MDkxOTI5Mzk0OTU5Njk3OTg5OXJhbmdlIHN0YXJ0IGluZGV4ICBvdXQgb2YgcmFuZ2UgZm9yIHNsaWNlIG9mIGxlbmd0aCDABBAAEgAAANIEEAAiAAAAcmFuZ2UgZW5kIGluZGV4IAQFEAAQAAAA0gQQACIAAABzb3VyY2Ugc2xpY2UgbGVuZ3RoICgpIGRvZXMgbm90IG1hdGNoIGRlc3RpbmF0aW9uIHNsaWNlIGxlbmd0aCAoJAUQABUAAAA5BRAAKwAAAIwDEAABAAAAL1VzZXJzL2FzaGVyLy5jYXJnby9yZWdpc3RyeS9zcmMvaW5kZXguY3JhdGVzLmlvLTZmMTdkMjJiYmExNTAwMWYvYmxvY2stYnVmZmVyLTAuMTAuNC9zcmMvbGliLnJzfAUQAGAAAABYAQAAHgAAAHwFEABgAAAAFQEAACwAAABhc3NlcnRpb24gZmFpbGVkOiBtaWQgPD0gc2VsZi5sZW4oKQABI0VniavN7/7cuph2VDIQ8OHSwwAAAADYngXBB9V8NhfdcDA5WQ73MQvA/xEVWGinj/lkpE/6vmfmCWqFrme7cvNuPDr1T6V/Ug5RjGgFm6vZgx8ZzeBb2J4FwV2du8sH1Xw2KimaYhfdcDBaAVmROVkO99jsLxUxC8D/ZyYzZxEVWGiHSrSOp4/5ZA0uDNukT/q+HUi1RwjJvPNn5glqO6fKhIWuZ7sr+JT+cvNuPPE2HV869U+l0YLmrX9SDlEfbD4rjGgFm2u9Qfur2YMfeSF+ExnN4FsvVXNlcnMvYXNoZXIvLmNhcmdvL3JlZ2lzdHJ5L3NyYy9pbmRleC5jcmF0ZXMuaW8tNmYxN2QyMmJiYTE1MDAxZi9hcnJheXZlYy0wLjcuNC9zcmMvYXJyYXl2ZWMucnP4BhAAYAAAAG0EAAAPAAAAY2xvc3VyZSBpbnZva2VkIHJlY3Vyc2l2ZWx5IG9yIGFmdGVyIGJlaW5nIGRyb3BwZWQAAAAAAAABAAAAAAAAAIKAAAAAAAAAioAAAAAAAIAAgACAAAAAgIuAAAAAAAAAAQAAgAAAAACBgACAAAAAgAmAAAAAAACAigAAAAAAAACIAAAAAAAAAAmAAIAAAAAACgAAgAAAAACLgACAAAAAAIsAAAAAAACAiYAAAAAAAIADgAAAAAAAgAKAAAAAAACAgAAAAAAAAIAKgAAAAAAAAAoAAIAAAACAgYAAgAAAAICAgAAAAAAAgAEAAIAAAAAACIAAgAAAAIAvVXNlcnMvYXNoZXIvLmNhcmdvL3JlZ2lzdHJ5L3NyYy9pbmRleC5jcmF0ZXMuaW8tNmYxN2QyMmJiYTE1MDAxZi9rZWNjYWstMC4xLjUvc3JjL2xpYi5yc0Egcm91bmRfY291bnQgZ3JlYXRlciB0aGFuIEtFQ0NBS19GX1JPVU5EX0NPVU5UIGlzIG5vdCBzdXBwb3J0ZWQhAABgCBAAWQAAAO4AAAAJAAAAY2FsbGVkIGBSZXN1bHQ6OnVud3JhcCgpYCBvbiBhbiBgRXJyYCB2YWx1ZQBjYWxsZWQgYE9wdGlvbjo6dW53cmFwKClgIG9uIGEgYE5vbmVgIHZhbHVlbGlicmFyeS9zdGQvc3JjL3Bhbmlja2luZy5ycwBjCRAAHAAAAFQCAAAeAAAAXgzp93yxqgLsqEPiA0tCrNP81Q3jW81yOn/59pObAW2TkR/S/3iZzeIpgHDJoXN1w4MqkmsyZLFwWJEE7j6IRubsA3EF46zqXFOjCLhpQcV8xN6NkVTnTAz0Ddzf9KIK+r5NpxhvtxBqq9FaI7bMxv/iL1chYXITHpKdGW+MSBrKBwDa9PnJS8dBUuj25vUmtkdZ6tt5kIWSjJ7JxYUYT0uGb6kedo7XfcG1UoxCNo7BYzA3J2jPaW7FtJs9yQe26rV2DnYOgn1C3H/wxpxcZOBCMyR4oDi/BH0unTw0a1/GDgtg64rC8qy8VHJf2A5s5U/bpIEiWXGf7Q/OafpnGdtFZbn4k1L9C2Cn8tfpechOGZMBkkgChrPAnC07U/mkE3aVFWyDU5DxezX8is9t21cPN3p66r4YZpC5UMoXcQM1SkJ0lwqzapskJeMCL+n04cocBgfbOXcFKqTsnLTz2HMvOFE/vla9KLuwQ1jt+kWDH78RXD2BHGmhX9e25PCKmZmth6QY7jMQRMmx6ugmPPkiqMArEBC1OxLmDDHvHhRUsd1ZALll/Afm4MVAhhXgz6PDJpgHToj9NcUjlQ0NkwArmk51jWM11Z1GQM/8hUBMOuKL0nqxxC5qPmr88LLKzT+UaxqXYChGBOMS4m7ePa5lF+Aq8yJi/giDR7ULVV0qou2gjanvqacNxIYWp1HDhHyGnG1YBRFTKKL9he7/3HbvXiwm0PvMAdKQicuU8rp12foq9WSU5hQ+E9+vE7CUWMkjKKPRpwYZEfYwUf6Vb8AGLEZOsyrZ0nF8iDPee+0+ORhlbm10eSkzcV04GaRbZHWpSLmmG3xnrP17GXyYMQI9BUvEI2zeTdYC0P5JHFhxFSY4Y01H3WLQc+TDRkWqYPhVlDTOj5LZlKvKuhsWSGhvDncwJJFjHGTGAualyG4r3X0zFSUohxtwSwNCa9osbQnLgcE3PbBvHMdmgkMI4VWyUevHgDErvIvAli+4kt+68zKmwMhoXFYFPRyGzARVj2uyX+Wkv6u0zrqzCouEQTJdRKpzojSzgdhaqPCWprxs1Si1Zez2JEpS9JAuUeEMWtMGVZ3XnU55l87G+gWJJTObED5bKRkgzFSgc4tHqfiwfkE0+fIkKcQbbVN9NZM5i/+2HcIaqDi/FmB98fvER/XjZ3bdqg8eluuLk2L/vHrJecGPlK2Npw3lESm3mB+PkRoSJ66O5GEImIUxrfdiTevqXO9Fo+vszoSWvF6yzvUhYve3DOIz9uSTgqsG3yyjpCzupSwgWpixj4rMR4QLz6NZmJdEUnafFwAkobEW1agmx127PrrXCznbarhVykvlY4BHbP06eh3dnmbnCMaeUSOqSdGiFVcOlPGPhHFFfRciTAFBMl+17sIubjqhXF4PYcP1dXuSKYA25NbDq58TrS9Az0yp8V0NyN+lvkjZiz5+9z+9V9OgpUX2dB8lLtGigqCBXlKe/WZJemh/zpAMLsU7l7q+vOjCX3QJ5bwBAADWs9rmu3c3QrVu8K5+HGbR2M+qTTUfeKH8rxYrSigRLR8difpnT/zx2gqSy13C7HNRJqHCIgxhroq3VtMQqOCWD4fnLx84mlowVU7p7WKt1ScUjTbo5SXSMUavx3B7l2VP1zneson4mUPR4VS/MD8jlzym2dN1lpqo+TTzT1VwVIhWT0p0y2oWra7ksqpMx3ASTSlvZJHQ8NExQGiJKrhXawu+YVpa2e+a8vJp6RK9L+if//4TcNObBloI1gQEmz8V/mwW88FASfve881NLFQJ41zNhYMhxbRBpmJE3Lc1yT+2046m+Bc0QFshWylZCbhyhYw779qc+V25/PgUBowB8806Gs2sFBstc7sA8nHUhBba6JUOEaPBuIIavyByCkMOId85DQl+t51e0DyfvfReRKRXftr2T534pdSD4WAd2keOmReEw4eyhhizGxLcPv7vywyYzDz+xwP9mxiQtW/k3FdMmkb9MjdlrfF8oAD3flmIHaNoRMZZ9mFb1LSwL3YYdwSZ0K5bFaa6UD1MXnVo37TYIn9OIen0lawuU7/dKgkBvbQJOa4yUDSOsDf1TYONciBCqJ0g+vcj/p6bHWmef42uxIjSRgRbeGnhJMVMe4UTyjUBf9ghpYp7Ew9Au86+lgdYZisuJ96wwiVBJhI2svserb0CdwXpS/isjru61HvGG2Q5MViRJOA2gOAt3IvtaJ/0VoE8YBFR79v3NtL3gB7SilnEJ5fXXwpnlgiKoMup6wlDj0rLoTZwD0tWr4G9mhl4p5q5wFLpyD/IHp+VuYFKeXdQUIzwOGMFj6/KOnhnemJQP7QHd8zs9UmrREqY7nm25NbDO4wQFM/R1MCcoMhrIAvABkSJLdfIVIihgixDPFyzZuNn8jcrEGHdI7kdJ4TYeSerVq8lFf+w4YO+qUl+IdRlfPvU50ht5+Dba54X2UWHgt8INL1T3Zpq6iIKICJWHBRu4+5Qt4wbXYB/N+hYn6XH5a88wrFPapl/4tDwdQf7fYbTGomIbt5z5tAlbLivnus6EpW4RcHV1fEw52ly7i1KQ7s4+jH57GfLeJy/OzJyAzvzdJwn+zZj1lKqTvsKrDNfUIfhzKKZzaXouzAtHoB0SVOQbYfVEVctjY4DvJEoQRofSGblgh3n4ta3MndJOmwDdKv1YWPZfraJogLq8diV7f891GQU1jsr5yBI3AsXDzCmeqd47WCHwes4IaEFWr6m5ph8+LSlIqG1kGkLFIlgPFbVXR85LstGTDSUt8nbrTLZ9a8VIORw6gjxjEc+Z6Zl15mNJ6t+dfvEkgZuLYbGEd8WO38N8YTr3QTqZaYE9i5vs9/g8A8PjkpRurw9+O7tpR43pA4qCk/8KYSzXKgdPujiHBu6gviP3A3oU4NeUEXNFwfb1ACa0RgBgfOl7c+gNPLKh4hRfucLNlHEszgUNB75zImQ9JdX4BQdWfKdP9L/zcWVhSLaPVQzKgWZ/YEfZnZ7D9tB5jaHB1OOQSV3IhX6si4WRn9f4v7ZE2wSsqhI6m7nkhdU3K+PidHGvxLZAxv1gxv6qrEx2bcq5JYnrPGs69L816ejQMW8+wptE1YQhQxtmt3hiXiqdHkqeCU105vAigcJXeKn0O3G6rM4Qb1wnutxvr8Kklxiwk/10KWio5ASC2vjVMArk/5i/1nd9n2sqBFFNTc11Nz6cpFehMrcIJ0yYCv4hBgvZ83hLMZ5LGQk0a2iCYsm59kZaunB0AxQqUubanha80NMYzYDAg4i2GbrSkd7wcKqm+zjGnNqWAKE4HpmJoKl7MqRdlbUZ7WtdUhcFZQd3z+BW5j9AG0GzXS3/G4oUa9Epx9HNIheLq5h566gLPea4OiuzeRAvmX2GFG7C5fpZBnfM+tLbnJilxkpBwA7cKcw7/UW2DFGvqYEFbW1gLhsS9h+w5MXZJZ96fZ37SF7c2v5LjEGY3f082/oSIlSrvj4o4by19tTYxD8TOfcyhbdxlL6vRlcANNq1GRdj4ZoahgezyxRnTquYFY4wmJ+Ntex3Hfq51njbr6adHMHbFJLc5/Q+eVac6iLVYrMxz9JRatBMFPBubC9WQpHulgZMpPDRl8LsC2F5bA20yubIJGf8Z5lfU9gbiTLLHjiipq5x8QUyLYq9cx7chG+r9knR02zIQEMDZV+H0etcFZDb3VJaFphQtSt9XqVuYCZ4IdOVeOuUN+hzypW1S/9OiaY2NaPDNhNkvTIOhdKdT3Kmc88v5GvrHtH/i3BkNb2cVPtlHBoXihcGoOkoAg3CsnTxYBl0Bc3kH8Pf/L9uBO7+RlDKFBNG2+9sRJA/4+jG3YcOx/i4sQwFQ2KLDenac5DiWbOtf4RThjlIWZzvYDbi2ELTVeL1ropfVv+5iU+YbuBP5EHvBCcHAeXLawJeeu+x1fXxTs1jeXD6GGP85J4AesawhybnPvv1Kv3lPQmfXKZAz5rlaJj4KMwnKBKmotKnbQPCQDVt2o/wIomV6DywJzRQr/tLZ3uPXKpYHnISQ8zQRtChwJyssacNgB8wJ7FCiU0NctJrE7v2CkB704kUPS23vTK5UbMivdjkphjq/4veEV6Xf65fI81RmNOZPfYWwDJLb8Vc3pCHCYlIarE0BdQjlGTbEiSOcPU16Lg/su0jd1dLCDWdXxhbFvj2JXC2xkrAwLTabNgMkHk3F9oQs4QVvbdud3zBvBI4bUd0qSOb0nNL+b8sCAx7rBYI5EbLAij9Ri4F4Oyz9KmnBgenKjI26pqVxhrDOP6mRKp6l225ycQf0t5K/vrWztEfzHkBKbQOVkyLYVL/H8g++5rrtV008eBsoKWMHW0w5ShCeO6BZ+0E3v5w4xnOSn4L0KpmHz/dhCwFksk7mc9ZhxXv/ihDePuWGcNH7e53nrZEbbJoldse4jVr7fhT5hrhK6QYv2lwazeTN+U/zpIxdFbigU3PLpCwWwWY0Bv97JuUriNTm0NbwOACOEdMR2XySMFnpHWfMwkKOxFyYIj5lmDW1eVmYjEDUCe+mgVckXLPoLRLwgGgjuY/drLqIYjCCl9qoh1uANEzZ8m4NG9KPf1kRv2AQIEOZ9m5N5K8IwhfB16zuWc1yk8YmWxC8CWkERoI7oDpZ2H8ZurjgVYpLHsI7zMHkC7Ad9Ymj0UX6ho6HCgniPyfTCI8U+DEWQatGXVFAIWcFJ0MxPuCV4oP889DpVTCci5VAKTWW3aMIlAmfI7hxNpUz+UVamEh8upyt5eoaDpKzUnIRQp+3pO/x838HYoIk8nUPQ5AouGXh3wOge7wZYOwXEFyL8jLiJohQhn0rC1gI7Uo3GWgbuT4YrTtVW4BIuh0OI6aV8z1a3stEhcyqEWSRk7dP3EmL40gQF3Ja2kVDzoh3nnueEz2hQQ4SgTomoinsUMJ2BfGm11X0lxd++vYPtT6Ju/PUT3p4bHrYKasnNhRQQJXr0ywmZ6vFiyyDpnjFUG8yp3ybbGOfZB2jXan+nvbSEV5nscxwxkESdVXFaUNsSTOXh3RmKOA+ppJD5azvOr+dIS0w+Ndh50xlLWzoO4RAFShT+jW1oLwp1aQ8MzluYa7P2MCKSMopcg9JYePKQkiEan7m6mL2E3Wg7P+WWxTGtK+6ugBhyqQ2t5YvFvwk1/D5vtVI7Mumw+JbvS7/+3pk+dorCVvCUujDjx3oul1oZU8LZ2xUrX3l2ARSu8vTCAiZJN6XCvgTzbADGe2m3/PkeIzN+fw42zfrgXjVKFOBJCtrFA0g7a8qn5S9Xc+s5E5n48Qw4gEhNIx3g6T8j8n7t2hSRyH83w5M84NgV0aexMTuwMfLanK+0yzuXzTS+sEUzqJkPRM8u8WH7HTATppO/8NNmTMlFfRFTlBlVkyV0K5H0xj0HeUFni3Wkas4w4hgqCVTSotC3pGnGEHqkQkHGDSbG38PdNeXGXwKsuKtYOXI2ql8D6Ipvz2vEvzJ/0gZLyb8bVf0g/qNz8Zwaj6GPO/NLjS5sswrv7k0v3P9pmunD+0mWhL9STDpd54gOhcV7ksHfszb6X5IU5ch60zxdQ914Cqgq34LhAOPAJI9R5hYk10Br8jsWrsuILksaWcpFaN2NBr2b7J3HK3Kt0IUH/ckqmzjyzpWYwCDNJSvD1mijXzQqXjV7CyDHg6JaPR12HdiLA/vPdkGEFEPN77JEUD7uusK31kojVD4X4UJvoTbdYg0h1SWEcU5H2TzWj7sbSgeS7AgeY7e19BST7iQLploUTdTCs7XInF4A1LR0Nw2uOwo9z6yZDBGOP71RYvjvdWjJSXJ4jRlwyz1OqkGfQnTRRTdLBJKaepu7PUSBPfi6GCg8iE2RI4ASUOTnOt/yGcKQsxNnM5wOKI9JaaNvxL6uyhGQG7Hm/73Bdnf5UGEic3bkTW60JFe111PAVUZjHDgbN6wv4tzoYkWeM1eTu81JQfBjR/4JO5ZIRXcmibKy5TKHuhl19Z1OxvoU0KkmMH3gdGd3564SnumYI9nSM0KI7ZI9RInwI4VbpUoiNrhDEjctopxqO7L8mdwQ4qkU7zbQ4d6YZ3g3sHGkWrQcuRoCTMdTGOBmmC22HpcVA2I+lH/q5FhhPpzwXsYoYHwKcyZgv2qsW6EoTq4AFPrtaZHO3BTtf9vJ1Vb6iASWpi35OAHQvG1PZ6HEDWNccME52YpXYbn89AG9Z/yZZsbnWxag9KWWfTPiQ1k3wzm6IrzP/XyeCRwEIgj8IMxTktfkamkD+Df1rOdssNKMlQ1KyAbNifueKWmFVZp+eb8MJLNOSLVpFhYV0R0mp3sfyup6jM8G0z2NiVLxuzECwg7Ams/3IVJQ7jNf/h55q9VbGK/SZDZTCLS1uCWsJ3/eYv1LYOh7gphkLtNTby5ypQlnF6UWvmJmlhjHZB+iVYjZz96H6GxhIax0KehXiV+wf1Rog9mpEZ0Z18LDPyusV5ngHKWhPH/O4HtEiztY+cSI7ycMup8FXMC8fP3zDrEbLDvWqAv2TuNvPnwtgLtkfM9Y66khh+Zik6oNqi25C2KjcXHO3dLKJoBFKUh5zs/aHSWfJy+UIiBGU05uxx+QGmQyiJJt+f+2vp0Q2697qCWXeDu/o0/EebLSPeelDfcm5oygMdITX8qJvVpdhR5aEe50GX7bm41t6EG++eO0wY/kVagd65w3m7tCbi6BK7ksrTom4xz6mVmr0/jS6WRMSAvwDNyj4mb9MyDCvDDVxgDl6aBfwiXqn0Gk1Qp7rqcHxmYHuLSh2eYy9eh/dpTcXXYD6qQk8Q1NP2aF831MMi/p3y2yIvNzZPyBHG6l8kUDA39zR+UIB0H1YezhPHfx2hANlMfPF5/gjOXPj50QiKgNLp/VQ16WHXC6ZmDbETCsIPPZYuOx7kd/abfhb/LhwMnbdtSm7cq4QKzYAd07JaleP+x7G2hLRGiek+sUOwxtpQ3EyzBFjJP8GMuUwjjZCMZajLOAxDjhx8XatCpZcjZU2pW3BMPTW+NLh5xs/0f/I4dtNAGaueHVG5nsGAT+DBW1Y/juttTS78Jcrock0XwmoDNYlRbZ6JNF3dAHzxtvcTdLK3tQULkrrHgq+2ea1vasBQ3n3cH4q/UAFJ4ot9N7BIkyjwI4HAYdjwfQaUd7lCjOavVI6u341ZH2qV3hpdzJMrgMWg04AEuN4rSAQoufyILRqDKdBneZBEeoYbOAoKGtPmL2MstKDnW5EbF+3Jn+NQU2MVke6jj0Y5r+tC9hEYBZff20gDj7KyxE5pFjivMAdskYXOnLTzdf1VKjKx5wdJj2IMqx8LJS6I2TCkHa4QoBHJFXlF584olZ2R77goC2rZ16bKE0x/buPnCuGRGUTFJ0EyHy0k8eRKzYbLILY3xP7VUaxTnup4hQHusseFF/eXJ1FQ2GJrPDV8fuoUwBbXhzYBOqX87P91KiBIWIIEipXQdO86YrlzEOGJREUpODGpP7FRJEPYs9lZdAzDaGcIZ9IjaRUIchjbaxePsSvDXdyOotyqe+H3yB7TpPX5YY+GrYDVeME1RnI+yHjyqa/YKyzUJoSw7affupoXs3HsYOUGZAcsGw3lcLVPOk9E625Kt8u1a6EeKDAEvVgLskQYuOjhj28zlE5FpudJjX6tc3QKm59DDNXf9iXYuhZ57CNiSHyjil+qqXRKQAAVUUbBrXhisCLOnCSbCscw8JC7yWva1nMlFYEVCLbcx0KmhfE2fmgtgRgPD2uoq/978SWlLRbB8j349QcHRTHxZw0VY4hOBa9eGokUPhoFfGyKbwClfq8+u0bBSPa8uVseXxTk9ywKOGqrilL7qA9STrXlWhBLGvftTd/LRIlvav8scRdEFgLgXCQKoj3N90P4Vw/ilG1yk1SWyVRhIeFnjziNL0ZgYIpQMvsPF1vW6B0yj7hQhUCELas4lkv0Xn5D1DM+eQn2jdgfYTxDVqXkl7+I+bTkOFt1kiAVnu41jJQbiE1gs63NppKS/YkeiongPcWaYyL7e+TVRXOTPS/3TclvZlLXduVS8AvgWmh/dOStgtmkJpKGvuyuaRGaRkMc2jaSX+qieKBX6Cxgw+aZmSL9ESWff+zJ7N1to1cYWvMlb7rvLkgT2eCWWV1giMxbwXPRT5xiORaVxHCVJmfYb/p6qhAYMS66s3BwPLpb0xFHGkSZEn2nEFwD1sm7zvc056KV8P1YA5tVTwyJoVgDlv1WRv6qcFGGvqPTHyhReKp11Up21lRymXCrzXOdgrbBUU9Eal+x+qBDQqstor4jlL/43tZU6KeoFbNSKyz3w1Db+Rc9Hqms8Re0OL72M/OTvA1mbMQb/U+xhnWnILWIgtpIN90Ckb9F0DtEIWOzPhsp8puOr8kyNZJcIEaWD0kYaJjwbu2rIsEMsxEfcKKo9mrEPSqW//df0uCBKhaSW2tlJ+MLU+npuHj6N41EoX31JPYQGWIf0v92r+kKgQgfCR8MtEXxaFuCYVmGja0ZmnVfQUhEsOlfSf3zzqkk5jVlIEiwM0cxfBk24lh/8S8Mz3xauZMGMsF4OqbuR0dzVz/D5hC/qdUuLCfS41xamrUe4z9pSLMqA/RMb3kK5WEFNNHOCTLX5f6xwfERlge7YZIBAu3HnnbzSh/QXP14guwwnf4gCFFkJVcAOtw8//da3qk1tnWOJ5QzgKnf2QAD+vrBm9gds8GzB0K/4aii/LZ5GLCGMldMFrYVF8iMocdW0f+tcxoFrVPLSC6K9fZuXmmpUMtkQ0chFPopBK/SKp+O98dL/JHDh54cwm1CuYM8u9Ct/+d0WHSIDkuKgYDK6EWlQRlOSLrYBm4uA7V/hYcJW4BJvgww8CacXY+lWUmFe1wlTamlDHWAofJsZSD8HRQ4VyykIxZunD2QpcLgRVKeWyMr/zpJVkNTnRo2GxxZzAbc9fod7AKkWEvxFrbu2FqZxWF8Ps+UZPV6YOeS3KU9I1kCVyY4Yfo/Qw3dcbTsTRdJQ28M+Q13OAbEzRCuKrQr36LtFAqBAg1q6NE7sSXmdCZFyBJe5qCQUTFtweDOyambGr99JUvdeXGCCxAF3KS7tmVp1S3iio9lHIvVfdCpAgSeBlOMzEskWLu6nyNqU8Js11mL4bDVfOxU10XEAa9Jz9BQLhs/kZZ+gzfkjfgP49euC43AOfPGOG8recpvqfdMYTeXO5E5T6H8UEbG3iK5/DSoHhMyaUoB7Z3KC5BOSymya/zXiahxQYlagx3wrwSzuHc1W22OjdbZ0rQmVTmFtK/gTRSj32J8xXs/GRvD8gTW4thvu90HT4nFLeC3KwXnRkD4L9A3fhh4OdXkuk3qlp3BGliUvr5Vj1GOva7i2RuokMVPwHwmMieh59+MKjMdwEVpCdMzEgzHcosL0MbE6Bvn48fHd7W3adHoAJmYMeyHMxkqzfS09H8JXKOk5t29A+OcANO7C3BAz3a+7L+mohD7tLOC65DT/vrI4nLIm059zwBDTZpIuDU0gI2XoVMeB/QugU4B0b1UjgTeuEzOLbHigV0SN9KoYpnnLKSus2t+mzHn+gMNJ4zCAlOnV+5I1kfKemv8V8mSg/2gDRuHISbsio6v+6ttJGPqDgZ4sPTxkX4799X8qos9gtrAC947nVv73n0YqkWiRzUWqURU9T+hJDSKfLmALAWe8LxQnTAI5h0dh8rYFN0wqPsdku9kRa5Y/SYjGrmrfE8ybwUl4NFbT4hhYgRR00n8H0XjlEpP1C1c5u0a2v5w2iBFhCusMpjO5Y9DhTboVVWS/yNXN4UbjXxiffB2lFOr2g+aNkPS42dT6jJ0fmgUj/gkTaAjofhRm7YXlBx0JkOGnE8EJNODLJlCFouaPDkH/z7VpvfXhDjXY3qehh5I7H9q3Gce+e+4Z25LiNFzzPqwOwhoccFGFLXpFlyfK5W6/WWONx1j7E9j2OqjoDpq401OZ+scgvAkfret5ItSWL9QVVrW00u+ejexm1+6r7Eq1c/Nc6QVtrWaVdzhBQ5QqZKIwqdDfgogFD59hXys3qiGeO4TRo0URGcrTEFWO97pSI8dzOGlgcaVsdFNr6dJJ7aE/loTKZ4my1l2u80wzt/qSdM9Bdr5iASYnYLfc2aiUN3loJn7eDKW+7z/HnIADZ1n0C2bZK1OZrQBojFejGwroNvIR84hkrK5gElMJ/RYjT/Zvs7/d0kfCBy6+Ls4tO29kreCOrHvk2ZnMSLmrCX5axJupcHz2ZHjLN1KnzFc5MbE1gek2HOLIKxDBy6CblVdZ3SEX2T3a9/EuSSbcatO9opvOzCVHHVwaIk/vaCTRPFWE8nYltR4zocJoHLAS7IB+nLf+MTGQnt+MlGAMj52EkyY/uI4+2bz4Ce8WwRmlOBGFck1Wv38wNRqPdHrvXmtxXPnH7U3sbX2xq7KAJBXOVEmU7bXiXUR7Yw/Kq4K4gRXSoh0ym7iwn1s5YC6RTqtY9aAt1XIZR7Z7WskKPA51j7AUq9g0xn04k7ufNL36QtnilIq4wyHsT8UixYupaM8wOyXdh/vb3RyoOugmDBQrS7sJrapWvoX7k/qXE3ZwQusthSMUnJWFOEHlS0l4ZIKr5maY7TLdyilSuFPJKsESzAe6jyDZmxiCO+N08b+giAfAPlVE3I0HAf1FfOfuytkFQ6OgbZJzwrAL+iMICEo65+wAMg7W0yAsaGQKlpfSing4p69TDLX3rFeefreeREaLXpvNwFD7Rzo+IOV4hueBrXoPbovc26nIcvo2TBvNFql4vXZpZe4iGrPMPl5apjEJCQjWlIRLMYmLuKHj6uh2TjtNw7iTH5va8Z1btf3KBFY8pllJsm/iiG7FGcP2ABXR63SVChBkDkTbHLdvflcGy/7StV7/IYEkGjNlpwCAcMy0RgmE91FE3nDiioDkPZVs1lUF9T15ElwZbvCnLxIzLIH6Vjc285oMPvzauJZ0UjARAyVHaYutz+h+Gyw7SllvBudWxsIHBvaW50ZXIgcGFzc2VkIHRvIHJ1c3RyZWN1cnNpdmUgdXNlIG9mIGFuIG9iamVjdCBkZXRlY3RlZCB3aGljaCB3b3VsZCBsZWFkIHRvIHVuc2FmZSBhbGlhc2luZyBpbiBydXN0AOdKBG5hbWUB30qVAQBFanNfc3lzOjpUeXBlRXJyb3I6Om5ldzo6X193YmdfbmV3X2QzMzE0OTRhYjYwYTg0OTE6Omg4ZDVkNWFhZGNiYjUyMzE0ATt3YXNtX2JpbmRnZW46Ol9fd2JpbmRnZW5fb2JqZWN0X2Ryb3BfcmVmOjpoMmQwNjhmOGYzZmVmZTY4MgJVanNfc3lzOjpVaW50OEFycmF5OjpieXRlX2xlbmd0aDo6X193YmdfYnl0ZUxlbmd0aF9hOGQ4OTRkOTM0MjViMmUwOjpoZjQyMTRlYWRmNmY3ZTQwOQNVanNfc3lzOjpVaW50OEFycmF5OjpieXRlX29mZnNldDo6X193YmdfYnl0ZU9mZnNldF84OWQwYTUyNjVkNWJkZTUzOjpoMzI2OGQzYjA4ODYyMDc2MQRManNfc3lzOjpVaW50OEFycmF5OjpidWZmZXI6Ol9fd2JnX2J1ZmZlcl8zZGEyYWVjZmQ5ODE0Y2Q4OjpoODdhYzM4NDIwZDEzYmJiYgV5anNfc3lzOjpVaW50OEFycmF5OjpuZXdfd2l0aF9ieXRlX29mZnNldF9hbmRfbGVuZ3RoOjpfX3diZ19uZXd3aXRoYnl0ZW9mZnNldGFuZGxlbmd0aF9kNjk1Yzc5NTc3ODhmOTIyOjpoYWU5ODY4NWQ0MDA1OThjZQZManNfc3lzOjpVaW50OEFycmF5OjpsZW5ndGg6Ol9fd2JnX2xlbmd0aF9mMDc2NDQxNmJhNWJiMjM3OjpoYzc1ZjdjMDYxOTJlMDI1OAcyd2FzbV9iaW5kZ2VuOjpfX3diaW5kZ2VuX21lbW9yeTo6aDkxYTBkMGNiMjE2YTM4YTYIVWpzX3N5czo6V2ViQXNzZW1ibHk6Ok1lbW9yeTo6YnVmZmVyOjpfX3diZ19idWZmZXJfNWQxYjU5OGEwMWI0MWE0Mjo6aGUyM2NlYWZhOGRhYzMzYmUJRmpzX3N5czo6VWludDhBcnJheTo6bmV3OjpfX3diZ19uZXdfYWNlNzE3OTMzYWQ3MTE3Zjo6aGM0MmEyY2Y3NDYwYzliMTkKRmpzX3N5czo6VWludDhBcnJheTo6c2V0OjpfX3diZ19zZXRfNzQ5MDZhYTMwODY0ZGY1YTo6aDMyZDI4NjM3ZjQ5NWIwYWMLMXdhc21fYmluZGdlbjo6X193YmluZGdlbl90aHJvdzo6aGNmYmIzZjRlZWMzODU1YjAMLHNoYTI6OnNoYTUxMjo6Y29tcHJlc3M1MTI6OmhhYjg4ZWQ2Y2ViODg0Njc0DRRkaWdlc3Rjb250ZXh0X2RpZ2VzdA4sc2hhMjo6c2hhMjU2Ojpjb21wcmVzczI1Njo6aDEwMDExZDlmNjY5Y2M0NTcPQGRlbm9fc3RkX3dhc21fY3J5cHRvOjpkaWdlc3Q6OkNvbnRleHQ6OnVwZGF0ZTo6aGMyNDIxODM5YzFmNDUxYTIQM2JsYWtlMjo6Qmxha2UyYlZhckNvcmU6OmNvbXByZXNzOjpoYzQ2ZDczMTQxM2U2MDhmZBFKZGVub19zdGRfd2FzbV9jcnlwdG86OmRpZ2VzdDo6Q29udGV4dDo6ZGlnZXN0X2FuZF9yZXNldDo6aDY0NjRkNzQ4MWE0OTQ2YjISKXJpcGVtZDo6YzE2MDo6Y29tcHJlc3M6OmhhNDJlYzM5ODM4MWYxOGMwEzNibGFrZTI6OkJsYWtlMnNWYXJDb3JlOjpjb21wcmVzczo6aGE5NjYyZTNkMGQ2OWVhYWYUK3NoYTE6OmNvbXByZXNzOjpjb21wcmVzczo6aGEwNGZhYmUwMGE5M2Q4NGQVLHRpZ2VyOjpjb21wcmVzczo6Y29tcHJlc3M6OmhlYmVhZTFjYzYzYTJkODAxFi1ibGFrZTM6Ok91dHB1dFJlYWRlcjo6ZmlsbDo6aDVkZGYxYWQyNmI1MGEyZTMXNmJsYWtlMzo6cG9ydGFibGU6OmNvbXByZXNzX2luX3BsYWNlOjpoNjFjZWM4NGZlMjc1ZTgzOBgTZGlnZXN0Y29udGV4dF9jbG9uZRk6ZGxtYWxsb2M6OmRsbWFsbG9jOjpEbG1hbGxvYzxBPjo6bWFsbG9jOjpoZDgwNGZjZWU1YTBjMmIwYho9ZGVub19zdGRfd2FzbV9jcnlwdG86OmRpZ2VzdDo6Q29udGV4dDo6bmV3OjpoNjhkZjVmMzMzYTM0YzgxZhtlPGRpZ2VzdDo6Y29yZV9hcGk6OndyYXBwZXI6OkNvcmVXcmFwcGVyPFQ+IGFzIGRpZ2VzdDo6VXBkYXRlPjo6dXBkYXRlOjp7e2Nsb3N1cmV9fTo6aDg4ZWQ0YjBlZGE4NDFkNWQcaDxtZDU6Ok1kNUNvcmUgYXMgZGlnZXN0Ojpjb3JlX2FwaTo6Rml4ZWRPdXRwdXRDb3JlPjo6ZmluYWxpemVfZml4ZWRfY29yZTo6e3tjbG9zdXJlfX06Omg1OTlmMzk1NGQxNjc1M2FiHTBibGFrZTM6OmNvbXByZXNzX3N1YnRyZWVfd2lkZTo6aGYyZjI0ZDRmY2Q4YWIwNDUeE2RpZ2VzdGNvbnRleHRfcmVzZXQfLGNvcmU6OmZtdDo6Rm9ybWF0dGVyOjpwYWQ6OmhiMGZmN2QxMzBhZjNhZGNhIDhkbG1hbGxvYzo6ZGxtYWxsb2M6OkRsbWFsbG9jPEE+OjpmcmVlOjpoOTNhMDUyZmVmMTUyYTJjMyEvYmxha2UzOjpIYXNoZXI6OmZpbmFsaXplX3hvZjo6aGFiM2IwOGYwNDA1YzQyZDkiMWJsYWtlMzo6SGFzaGVyOjptZXJnZV9jdl9zdGFjazo6aGM1ZTllNjkyYjE2NDRmNDEjIG1kNDo6Y29tcHJlc3M6Omg3MGY1OWI1ZTdjMTgyZTY5JEFkbG1hbGxvYzo6ZGxtYWxsb2M6OkRsbWFsbG9jPEE+OjpkaXNwb3NlX2NodW5rOjpoNDNiZjI4YmQwMTM4NjlkMiUga2VjY2FrOjpwMTYwMDo6aDUyODU4YmExYzM4NmM2Y2MmcjxzaGEyOjpjb3JlX2FwaTo6U2hhNTEyVmFyQ29yZSBhcyBkaWdlc3Q6OmNvcmVfYXBpOjpWYXJpYWJsZU91dHB1dENvcmU+OjpmaW5hbGl6ZV92YXJpYWJsZV9jb3JlOjpoM2YxODJiMGZhNTVkZjMyNScOX19ydXN0X3JlYWxsb2MoTmNvcmU6OmZtdDo6bnVtOjppbXA6OjxpbXBsIGNvcmU6OmZtdDo6RGlzcGxheSBmb3IgdTMyPjo6Zm10OjpoM2YwNGM3OTljZTE5ZmQ1NilyPHNoYTI6OmNvcmVfYXBpOjpTaGEyNTZWYXJDb3JlIGFzIGRpZ2VzdDo6Y29yZV9hcGk6OlZhcmlhYmxlT3V0cHV0Q29yZT46OmZpbmFsaXplX3ZhcmlhYmxlX2NvcmU6Omg3MWY5OTQ3M2RmNDg1NDk2KiNjb3JlOjpmbXQ6OndyaXRlOjpoN2I2MmEwMmZiMDQ3ZDA1NStdPHNoYTE6OlNoYTFDb3JlIGFzIGRpZ2VzdDo6Y29yZV9hcGk6OkZpeGVkT3V0cHV0Q29yZT46OmZpbmFsaXplX2ZpeGVkX2NvcmU6OmhlM2Q2Zjc3ZTEzNTZjODA2LDRibGFrZTM6OmNvbXByZXNzX3BhcmVudHNfcGFyYWxsZWw6OmhjZGZlMjExYzM5MTBlYzM3LUM8RCBhcyBkaWdlc3Q6OmRpZ2VzdDo6RHluRGlnZXN0Pjo6ZmluYWxpemVfcmVzZXQ6OmhmMTIxNjJjOWIzMmUwNWVkLj08RCBhcyBkaWdlc3Q6OmRpZ2VzdDo6RHluRGlnZXN0Pjo6ZmluYWxpemU6Omg1N2JlNTZhYWRhZTA2YTM3Ly1ibGFrZTM6OkNodW5rU3RhdGU6OnVwZGF0ZTo6aDQ4NzRhZWE4YjE1ZWMzNGUwPGRsbWFsbG9jOjpkbG1hbGxvYzo6RGxtYWxsb2M8QT46Om1lbWFsaWduOjpoZGZhYjYzYWExNmUxNzU0MzFkPHNoYTM6OlNoYWtlMTI4Q29yZSBhcyBkaWdlc3Q6OmNvcmVfYXBpOjpFeHRlbmRhYmxlT3V0cHV0Q29yZT46OmZpbmFsaXplX3hvZl9jb3JlOjpoMTU5YTRlZjRhNzM2ZGZjNjJGZGlnZXN0OjpFeHRlbmRhYmxlT3V0cHV0UmVzZXQ6OmZpbmFsaXplX2JveGVkX3Jlc2V0OjpoODI2ZDAxMTZlMjMwYmMzNTNlPGRpZ2VzdDo6Y29yZV9hcGk6OndyYXBwZXI6OkNvcmVXcmFwcGVyPFQ+IGFzIGRpZ2VzdDo6VXBkYXRlPjo6dXBkYXRlOjp7e2Nsb3N1cmV9fTo6aGVlOGQ0ZGUwZjEwYzM0Zjk0QzxEIGFzIGRpZ2VzdDo6ZGlnZXN0OjpEeW5EaWdlc3Q+OjpmaW5hbGl6ZV9yZXNldDo6aDgxY2I3ZmJjMzRlN2Y3ZDA1YjxzaGEzOjpLZWNjYWsyMjRDb3JlIGFzIGRpZ2VzdDo6Y29yZV9hcGk6OkZpeGVkT3V0cHV0Q29yZT46OmZpbmFsaXplX2ZpeGVkX2NvcmU6OmgzNzYxM2VlODQ4MDZlMjAwNmE8c2hhMzo6U2hhM18yMjRDb3JlIGFzIGRpZ2VzdDo6Y29yZV9hcGk6OkZpeGVkT3V0cHV0Q29yZT46OmZpbmFsaXplX2ZpeGVkX2NvcmU6OmgyOWY2M2EyM2EwNTg4ZDNmNzFjb21waWxlcl9idWlsdGluczo6bWVtOjptZW1jcHk6Omg5NTI3YTQ4MDZmZGM3YWU4OGE8c2hhMzo6U2hhM18yNTZDb3JlIGFzIGRpZ2VzdDo6Y29yZV9hcGk6OkZpeGVkT3V0cHV0Q29yZT46OmZpbmFsaXplX2ZpeGVkX2NvcmU6Omg1OGU2MmQ1YjIyMTlhYjBkOWI8c2hhMzo6S2VjY2FrMjU2Q29yZSBhcyBkaWdlc3Q6OmNvcmVfYXBpOjpGaXhlZE91dHB1dENvcmU+OjpmaW5hbGl6ZV9maXhlZF9jb3JlOjpoNzJmZjBkMDg0Y2YzOWY3ZDpkPHNoYTM6OlNoYWtlMjU2Q29yZSBhcyBkaWdlc3Q6OmNvcmVfYXBpOjpFeHRlbmRhYmxlT3V0cHV0Q29yZT46OmZpbmFsaXplX3hvZl9jb3JlOjpoN2M5NjY2OTExYjU3NGVmNjtlPGRpZ2VzdDo6Y29yZV9hcGk6OndyYXBwZXI6OkNvcmVXcmFwcGVyPFQ+IGFzIGRpZ2VzdDo6VXBkYXRlPjo6dXBkYXRlOjp7e2Nsb3N1cmV9fTo6aDRhZDZlNjRkZDllNWRmZTI8ZDxyaXBlbWQ6OlJpcGVtZDE2MENvcmUgYXMgZGlnZXN0Ojpjb3JlX2FwaTo6Rml4ZWRPdXRwdXRDb3JlPjo6ZmluYWxpemVfZml4ZWRfY29yZTo6aDJlYmQyZGFkOTljMGViZmE9cjxkaWdlc3Q6OmNvcmVfYXBpOjp4b2ZfcmVhZGVyOjpYb2ZSZWFkZXJDb3JlV3JhcHBlcjxUPiBhcyBkaWdlc3Q6OlhvZlJlYWRlcj46OnJlYWQ6Ont7Y2xvc3VyZX19OjpoZTFlYzJlOGI0NDU0YjA4Mz5GZGxtYWxsb2M6OmRsbWFsbG9jOjpEbG1hbGxvYzxBPjo6dW5saW5rX2xhcmdlX2NodW5rOjpoNGZhNDdmMWM0MTZiNjM3ZD89PEQgYXMgZGlnZXN0OjpkaWdlc3Q6OkR5bkRpZ2VzdD46OmZpbmFsaXplOjpoM2I0YjkxNDRiZjBmYzNmZkA7ZGlnZXN0OjpFeHRlbmRhYmxlT3V0cHV0OjpmaW5hbGl6ZV9ib3hlZDo6aDU1YTNkZjhiMTNkZWU1N2VBRmRsbWFsbG9jOjpkbG1hbGxvYzo6RGxtYWxsb2M8QT46Omluc2VydF9sYXJnZV9jaHVuazo6aDEyMDRmZDY4Y2ZlOTBlYjZCZTxkaWdlc3Q6OmNvcmVfYXBpOjp3cmFwcGVyOjpDb3JlV3JhcHBlcjxUPiBhcyBkaWdlc3Q6OlVwZGF0ZT46OnVwZGF0ZTo6e3tjbG9zdXJlfX06OmgwYWI1YjU2ZTVlMmFkMWExQ2I8c2hhMzo6S2VjY2FrMzg0Q29yZSBhcyBkaWdlc3Q6OmNvcmVfYXBpOjpGaXhlZE91dHB1dENvcmU+OjpmaW5hbGl6ZV9maXhlZF9jb3JlOjpoODc4ZjUyNDdkOWRkYzk3ZkRhPHNoYTM6OlNoYTNfMzg0Q29yZSBhcyBkaWdlc3Q6OmNvcmVfYXBpOjpGaXhlZE91dHB1dENvcmU+OjpmaW5hbGl6ZV9maXhlZF9jb3JlOjpoMDQ1OWMxZTkwMWU5NjNjOUVGZGlnZXN0OjpFeHRlbmRhYmxlT3V0cHV0UmVzZXQ6OmZpbmFsaXplX2JveGVkX3Jlc2V0OjpoZmVkMTgxYjIzZDVjYTkyN0ZDPEQgYXMgZGlnZXN0OjpkaWdlc3Q6OkR5bkRpZ2VzdD46OmZpbmFsaXplX3Jlc2V0OjpoZTlhODg4ZmUyNjI3YWRhZUdbPG1kNDo6TWQ0Q29yZSBhcyBkaWdlc3Q6OmNvcmVfYXBpOjpGaXhlZE91dHB1dENvcmU+OjpmaW5hbGl6ZV9maXhlZF9jb3JlOjpoNWFhMmNjMjc4ZmUzN2M2Y0hbPG1kNTo6TWQ1Q29yZSBhcyBkaWdlc3Q6OmNvcmVfYXBpOjpGaXhlZE91dHB1dENvcmU+OjpmaW5hbGl6ZV9maXhlZF9jb3JlOjpoN2JhNGVjOTk5Nzg2Y2QxNUlyPGRpZ2VzdDo6Y29yZV9hcGk6OnhvZl9yZWFkZXI6OlhvZlJlYWRlckNvcmVXcmFwcGVyPFQ+IGFzIGRpZ2VzdDo6WG9mUmVhZGVyPjo6cmVhZDo6e3tjbG9zdXJlfX06OmgxZmFjYzY2NTAyMWQzNjI2Sl88dGlnZXI6OlRpZ2VyQ29yZSBhcyBkaWdlc3Q6OmNvcmVfYXBpOjpGaXhlZE91dHB1dENvcmU+OjpmaW5hbGl6ZV9maXhlZF9jb3JlOjpoNDI5OTZiMWExMjM1YjNkMUtiPHNoYTM6OktlY2NhazUxMkNvcmUgYXMgZGlnZXN0Ojpjb3JlX2FwaTo6Rml4ZWRPdXRwdXRDb3JlPjo6ZmluYWxpemVfZml4ZWRfY29yZTo6aDVhNTJjZjcxMGZlNDFlYTZMYTxzaGEzOjpTaGEzXzUxMkNvcmUgYXMgZGlnZXN0Ojpjb3JlX2FwaTo6Rml4ZWRPdXRwdXRDb3JlPjo6ZmluYWxpemVfZml4ZWRfY29yZTo6aDU2ZTJmMzc3NmEzMmRlMzRNQzxEIGFzIGRpZ2VzdDo6ZGlnZXN0OjpEeW5EaWdlc3Q+OjpmaW5hbGl6ZV9yZXNldDo6aGFlZjFlZWM3MjM4MWFkOTFOQzxEIGFzIGRpZ2VzdDo6ZGlnZXN0OjpEeW5EaWdlc3Q+OjpmaW5hbGl6ZV9yZXNldDo6aDhlM2UzYTAzMDI0N2VkY2ZPPTxEIGFzIGRpZ2VzdDo6ZGlnZXN0OjpEeW5EaWdlc3Q+OjpmaW5hbGl6ZTo6aDAwNzk1ZWFlNWJiN2QyYzJQPTxEIGFzIGRpZ2VzdDo6ZGlnZXN0OjpEeW5EaWdlc3Q+OjpmaW5hbGl6ZTo6aDcyNjA3OGZiYjc5YjQzMWNRPTxEIGFzIGRpZ2VzdDo6ZGlnZXN0OjpEeW5EaWdlc3Q+OjpmaW5hbGl6ZTo6aGJiMzQ3M2Y2OWE1MzUwNjdSZTxkaWdlc3Q6OmNvcmVfYXBpOjp3cmFwcGVyOjpDb3JlV3JhcHBlcjxUPiBhcyBkaWdlc3Q6OlVwZGF0ZT46OnVwZGF0ZTo6e3tjbG9zdXJlfX06Omg2MjU4NTM4NjI2ZmFlY2U2Uz5kZW5vX3N0ZF93YXNtX2NyeXB0bzo6RGlnZXN0Q29udGV4dDo6dXBkYXRlOjpoZjdhNjAzZDBlNmRmZjljNVQGZGlnZXN0VUVnZW5lcmljX2FycmF5OjpmdW5jdGlvbmFsOjpGdW5jdGlvbmFsU2VxdWVuY2U6Om1hcDo6aGUxZWU5MDY5MzYwMTVmYzlWMWNvbXBpbGVyX2J1aWx0aW5zOjptZW06Om1lbXNldDo6aDJjOGIwODBmMGZlZDNiZWVXEWRpZ2VzdGNvbnRleHRfbmV3WGU8ZGlnZXN0Ojpjb3JlX2FwaTo6d3JhcHBlcjo6Q29yZVdyYXBwZXI8VD4gYXMgZGlnZXN0OjpVcGRhdGU+Ojp1cGRhdGU6Ont7Y2xvc3VyZX19OjpoNzRmNTc2ODYxMzIyYmYwMVkcZGlnZXN0Y29udGV4dF9kaWdlc3RBbmRSZXNldFobZGlnZXN0Y29udGV4dF9kaWdlc3RBbmREcm9wWztkaWdlc3Q6OkV4dGVuZGFibGVPdXRwdXQ6OmZpbmFsaXplX2JveGVkOjpoMmIzNjRlODk4ZjBiMDdmMFwtanNfc3lzOjpVaW50OEFycmF5Ojp0b192ZWM6OmhkYjFiNmQ2MzI1ZmM1YWQ2XT93YXNtX2JpbmRnZW46OmNvbnZlcnQ6OmNsb3N1cmVzOjppbnZva2UzX211dDo6aGYyMGE2YzQ0Y2E3ZWY3YmFeR2Rlbm9fc3RkX3dhc21fY3J5cHRvOjpEaWdlc3RDb250ZXh0OjpkaWdlc3RfYW5kX2Ryb3A6OmhkMzQwMTc3NTBjNTY5OTg5Xy5jb3JlOjpyZXN1bHQ6OnVud3JhcF9mYWlsZWQ6OmhiZTc5YTQxOGZhYjQ2MWZmYD9jb3JlOjpzbGljZTo6aW5kZXg6OnNsaWNlX2VuZF9pbmRleF9sZW5fZmFpbDo6aDE5ODBmZTE1YmE0ZWIyZjZhQWNvcmU6OnNsaWNlOjppbmRleDo6c2xpY2Vfc3RhcnRfaW5kZXhfbGVuX2ZhaWw6OmhjMTdiNjViNmU5ZTVmODFhYk5jb3JlOjpzbGljZTo6PGltcGwgW1RdPjo6Y29weV9mcm9tX3NsaWNlOjpsZW5fbWlzbWF0Y2hfZmFpbDo6aDcyNzkxNDkwMjJhYmUwZGRjNmNvcmU6OnBhbmlja2luZzo6cGFuaWNfYm91bmRzX2NoZWNrOjpoYTFiNzM2YzA0Yjc1NTA1MGRQPGFycmF5dmVjOjplcnJvcnM6OkNhcGFjaXR5RXJyb3I8VD4gYXMgY29yZTo6Zm10OjpEZWJ1Zz46OmZtdDo6aDdhNzdjMDhkOGRiZjIyNjRlUDxhcnJheXZlYzo6ZXJyb3JzOjpDYXBhY2l0eUVycm9yPFQ+IGFzIGNvcmU6OmZtdDo6RGVidWc+OjpmbXQ6OmhmNGJkMTIxYTRjZmE3MzRiZhhfX3diZ19kaWdlc3Rjb250ZXh0X2ZyZWVnRWdlbmVyaWNfYXJyYXk6OmZ1bmN0aW9uYWw6OkZ1bmN0aW9uYWxTZXF1ZW5jZTo6bWFwOjpoZTU1NzU0Yjg1MjhiNjRhYmhFZ2VuZXJpY19hcnJheTo6ZnVuY3Rpb25hbDo6RnVuY3Rpb25hbFNlcXVlbmNlOjptYXA6OmhlNjk0MzU1MmY5Y2MyZGVjaUVnZW5lcmljX2FycmF5OjpmdW5jdGlvbmFsOjpGdW5jdGlvbmFsU2VxdWVuY2U6Om1hcDo6aGZjY2M4MDQ4Zjk2MGQzMjlqRWdlbmVyaWNfYXJyYXk6OmZ1bmN0aW9uYWw6OkZ1bmN0aW9uYWxTZXF1ZW5jZTo6bWFwOjpoMjBiNzEwYmM1NGQ0MzczNGtFZ2VuZXJpY19hcnJheTo6ZnVuY3Rpb25hbDo6RnVuY3Rpb25hbFNlcXVlbmNlOjptYXA6OmgyNTI3OTgzOGJiNDgzNGJhbEVnZW5lcmljX2FycmF5OjpmdW5jdGlvbmFsOjpGdW5jdGlvbmFsU2VxdWVuY2U6Om1hcDo6aGM0N2M0NjllMjVkNWE2ZTVtN3N0ZDo6cGFuaWNraW5nOjpydXN0X3BhbmljX3dpdGhfaG9vazo6aGMyMGVhZGRlZDZiZmU2ODduEV9fd2JpbmRnZW5fbWFsbG9jbzFjb21waWxlcl9idWlsdGluczo6bWVtOjptZW1jbXA6Omg2ZjBjZWZmMzNkYjk0YzBhcBRkaWdlc3Rjb250ZXh0X3VwZGF0ZXEpY29yZTo6cGFuaWNraW5nOjpwYW5pYzo6aDdiYmVhMzc3M2I3NTIyMzVyQ2NvcmU6OmZtdDo6Rm9ybWF0dGVyOjpwYWRfaW50ZWdyYWw6OndyaXRlX3ByZWZpeDo6aDMyMWU5NWI2ZThkMDAxOGJzNGFsbG9jOjpyYXdfdmVjOjpjYXBhY2l0eV9vdmVyZmxvdzo6aDg0N2E2ODJiNDJkZDY4NGZ0LWNvcmU6OnBhbmlja2luZzo6cGFuaWNfZm10OjpoN2EzNjgzODU5MzY4ODhkY3VDc3RkOjpwYW5pY2tpbmc6OmJlZ2luX3BhbmljX2hhbmRsZXI6Ont7Y2xvc3VyZX19OjpoODI0MTVmZTM1YjBlMjAwMXYSX193YmluZGdlbl9yZWFsbG9jdz93YXNtX2JpbmRnZW46OmNvbnZlcnQ6OmNsb3N1cmVzOjppbnZva2U0X211dDo6aGQ3NWJiZDY1NmUxZGZlMWV4EXJ1c3RfYmVnaW5fdW53aW5keT93YXNtX2JpbmRnZW46OmNvbnZlcnQ6OmNsb3N1cmVzOjppbnZva2UzX211dDo6aDdlMzdjNGQ3MWQxM2M0NmF6P3dhc21fYmluZGdlbjo6Y29udmVydDo6Y2xvc3VyZXM6Omludm9rZTNfbXV0OjpoMTYxZDFiYWNjMWE0M2FjYXs/d2FzbV9iaW5kZ2VuOjpjb252ZXJ0OjpjbG9zdXJlczo6aW52b2tlM19tdXQ6OmhhYjRmZGQzODA1N2Q2MDg3fD93YXNtX2JpbmRnZW46OmNvbnZlcnQ6OmNsb3N1cmVzOjppbnZva2UzX211dDo6aGNmN2M3YWYwNjQ4NDdkNDl9P3dhc21fYmluZGdlbjo6Y29udmVydDo6Y2xvc3VyZXM6Omludm9rZTNfbXV0OjpoMzRhNjU4OWY4MDdiZGZkOH4/d2FzbV9iaW5kZ2VuOjpjb252ZXJ0OjpjbG9zdXJlczo6aW52b2tlM19tdXQ6OmhjYmFkYzZmZDMyZDU3YWY1fz93YXNtX2JpbmRnZW46OmNvbnZlcnQ6OmNsb3N1cmVzOjppbnZva2UzX211dDo6aDMwOGYyYzFlNzEyMmVkMjKAAT93YXNtX2JpbmRnZW46OmNvbnZlcnQ6OmNsb3N1cmVzOjppbnZva2UzX211dDo6aDdlNDViZTAwMzhlMjNhNDmBAT93YXNtX2JpbmRnZW46OmNvbnZlcnQ6OmNsb3N1cmVzOjppbnZva2UyX211dDo6aDExZGYyOWNjMDRiMjA0MmOCAT93YXNtX2JpbmRnZW46OmNvbnZlcnQ6OmNsb3N1cmVzOjppbnZva2UxX211dDo6aGVjZGUzZGNkNjBhZmY3YjCDATA8JlQgYXMgY29yZTo6Zm10OjpEZWJ1Zz46OmZtdDo6aGRiNDg4ZmYxMjM4MmU1OTaEATI8JlQgYXMgY29yZTo6Zm10OjpEaXNwbGF5Pjo6Zm10OjpoMWY5YjU3ZDlmNjNiYTNlZYUBMTxUIGFzIGNvcmU6OmFueTo6QW55Pjo6dHlwZV9pZDo6aDQyZmM3MTY1MjM4NzQ2ZGaGAQ9fX3diaW5kZ2VuX2ZyZWWHATNhcnJheXZlYzo6YXJyYXl2ZWM6OmV4dGVuZF9wYW5pYzo6aGFhODcyMjYxZjBlODg1YjGIATljb3JlOjpvcHM6OmZ1bmN0aW9uOjpGbk9uY2U6OmNhbGxfb25jZTo6aDhlNTMxYjBiN2JmNjYyMGOJAR9fX3diaW5kZ2VuX2FkZF90b19zdGFja19wb2ludGVyigExd2FzbV9iaW5kZ2VuOjpfX3J0Ojp0aHJvd19udWxsOjpoZDJjODFlOTdjMWJiNTYxYosBMndhc21fYmluZGdlbjo6X19ydDo6Ym9ycm93X2ZhaWw6Omg2NzkzZDQzZDUxNjAxZDU2jAEqd2FzbV9iaW5kZ2VuOjp0aHJvd19zdHI6OmhjMTljYmM0N2I3ZWMzZDk3jQFJc3RkOjpzeXNfY29tbW9uOjpiYWNrdHJhY2U6Ol9fcnVzdF9lbmRfc2hvcnRfYmFja3RyYWNlOjpoNzFmNTA0ZDQ2YTIwM2Q4OI4BBm1lbXNldI8BBm1lbWNtcJABBm1lbWNweZEBCnJ1c3RfcGFuaWOSAVdjb3JlOjpwdHI6OmRyb3BfaW5fcGxhY2U8YXJyYXl2ZWM6OmVycm9yczo6Q2FwYWNpdHlFcnJvcjwmW3U4OyA2NF0+Pjo6aDkwYWYxZWNjYzI3YzBiNWSTAVZjb3JlOjpwdHI6OmRyb3BfaW5fcGxhY2U8YXJyYXl2ZWM6OmVycm9yczo6Q2FwYWNpdHlFcnJvcjxbdTg7IDMyXT4+OjpoNTNkNGJlZjcyZWQxN2IyYZQBPWNvcmU6OnB0cjo6ZHJvcF9pbl9wbGFjZTxjb3JlOjpmbXQ6OkVycm9yPjo6aGMzZmY0OWFkMzQ0ODkyY2EAbwlwcm9kdWNlcnMCCGxhbmd1YWdlAQRSdXN0AAxwcm9jZXNzZWQtYnkDBXJ1c3RjHTEuNzQuMCAoNzllOTcxNmM5IDIwMjMtMTEtMTMpBndhbHJ1cwYwLjIwLjMMd2FzbS1iaW5kZ2VuBjAuMi45MAAsD3RhcmdldF9mZWF0dXJlcwIrD211dGFibGUtZ2xvYmFscysIc2lnbi1leHQ=    ");
  const wasmModule = new WebAssembly.Module(wasmBytes);
  return new WebAssembly.Instance(wasmModule, imports);
}
function base64decode(b64) {
  const binString = atob(b64);
  const size = binString.length;
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    bytes[i] = binString.charCodeAt(i);
  }
  return bytes;
}

// deno:https://deno.land/std@0.214.0/crypto/_wasm/mod.ts
var digestAlgorithms = [
  "BLAKE2B-128",
  "BLAKE2B-160",
  "BLAKE2B-224",
  "BLAKE2B-256",
  "BLAKE2B-384",
  "BLAKE2B",
  "BLAKE2S",
  "BLAKE3",
  "KECCAK-224",
  "KECCAK-256",
  "KECCAK-384",
  "KECCAK-512",
  "SHA-384",
  "SHA3-224",
  "SHA3-256",
  "SHA3-384",
  "SHA3-512",
  "SHAKE128",
  "SHAKE256",
  "TIGER",
  // insecure (length-extendable):
  "RIPEMD-160",
  "SHA-224",
  "SHA-256",
  "SHA-512",
  // insecure (collidable and length-extendable):
  "MD4",
  "MD5",
  "SHA-1"
];

// deno:https://deno.land/std@0.214.0/crypto/_fnv/util.ts
function swap32(val) {
  return (val & 255) << 24 | (val & 65280) << 8 | val >> 8 & 65280 | val >> 24 & 255;
}
function n16(n) {
  return n & 65535;
}
function n32(n) {
  return n >>> 0;
}
function add32WithCarry(a, b) {
  const added = n32(a) + n32(b);
  return [
    n32(added),
    added > 4294967295 ? 1 : 0
  ];
}
function mul32WithCarry(a, b) {
  const al = n16(a);
  const ah = n16(a >>> 16);
  const bl = n16(b);
  const bh = n16(b >>> 16);
  const [t, tc] = add32WithCarry(al * bh, ah * bl);
  const [n, nc] = add32WithCarry(al * bl, n32(t << 16));
  const carry = nc + (tc << 16) + n16(t >>> 16) + ah * bh;
  return [
    n,
    carry
  ];
}
function mul32(a, b) {
  const al = n16(a);
  const ah = a - al;
  return n32(n32(ah * b) + al * b);
}
function mul64([ah, al], [bh, bl]) {
  const [n, c] = mul32WithCarry(al, bl);
  return [
    n32(mul32(al, bh) + mul32(ah, bl) + c),
    n
  ];
}

// deno:https://deno.land/std@0.214.0/crypto/_fnv/fnv32.ts
var prime32 = 16777619;
var fnv32 = (data) => {
  let hash = 2166136261;
  data.forEach((c) => {
    hash = mul32(hash, prime32);
    hash ^= c;
  });
  return Uint32Array.from([
    swap32(hash)
  ]).buffer;
};
var fnv32a = (data) => {
  let hash = 2166136261;
  data.forEach((c) => {
    hash ^= c;
    hash = mul32(hash, prime32);
  });
  return Uint32Array.from([
    swap32(hash)
  ]).buffer;
};

// deno:https://deno.land/std@0.214.0/crypto/_fnv/fnv64.ts
var prime64Lo = 435;
var prime64Hi = 256;
var fnv64 = (data) => {
  let hashLo = 2216829733;
  let hashHi = 3421674724;
  data.forEach((c) => {
    [hashHi, hashLo] = mul64([
      hashHi,
      hashLo
    ], [
      prime64Hi,
      prime64Lo
    ]);
    hashLo ^= c;
  });
  return new Uint32Array([
    swap32(hashHi >>> 0),
    swap32(hashLo >>> 0)
  ]).buffer;
};
var fnv64a = (data) => {
  let hashLo = 2216829733;
  let hashHi = 3421674724;
  data.forEach((c) => {
    hashLo ^= c;
    [hashHi, hashLo] = mul64([
      hashHi,
      hashLo
    ], [
      prime64Hi,
      prime64Lo
    ]);
  });
  return new Uint32Array([
    swap32(hashHi >>> 0),
    swap32(hashLo >>> 0)
  ]).buffer;
};

// deno:https://deno.land/std@0.214.0/crypto/_fnv/mod.ts
function fnv(name, buf) {
  if (!buf) {
    throw new TypeError("no data provided for hashing");
  }
  switch (name) {
    case "FNV32":
      return fnv32(buf);
    case "FNV64":
      return fnv64(buf);
    case "FNV32A":
      return fnv32a(buf);
    case "FNV64A":
      return fnv64a(buf);
    default:
      throw new TypeError(`unsupported fnv digest: ${name}`);
  }
}

// deno:https://deno.land/std@0.214.0/crypto/crypto.ts
var webCrypto = ((crypto2) => ({
  getRandomValues: crypto2.getRandomValues?.bind(crypto2),
  randomUUID: crypto2.randomUUID?.bind(crypto2),
  subtle: {
    decrypt: crypto2.subtle?.decrypt?.bind(crypto2.subtle),
    deriveBits: crypto2.subtle?.deriveBits?.bind(crypto2.subtle),
    deriveKey: crypto2.subtle?.deriveKey?.bind(crypto2.subtle),
    digest: crypto2.subtle?.digest?.bind(crypto2.subtle),
    encrypt: crypto2.subtle?.encrypt?.bind(crypto2.subtle),
    exportKey: crypto2.subtle?.exportKey?.bind(crypto2.subtle),
    generateKey: crypto2.subtle?.generateKey?.bind(crypto2.subtle),
    importKey: crypto2.subtle?.importKey?.bind(crypto2.subtle),
    sign: crypto2.subtle?.sign?.bind(crypto2.subtle),
    unwrapKey: crypto2.subtle?.unwrapKey?.bind(crypto2.subtle),
    verify: crypto2.subtle?.verify?.bind(crypto2.subtle),
    wrapKey: crypto2.subtle?.wrapKey?.bind(crypto2.subtle)
  }
}))(globalThis.crypto);
var bufferSourceBytes = (data) => {
  let bytes;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (ArrayBuffer.isView(data)) {
    bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  }
  return bytes;
};
var stdCrypto = /* @__PURE__ */ ((x) => x)({
  ...webCrypto,
  subtle: {
    ...webCrypto.subtle,
    /**
     * Polyfills stream support until the Web Crypto API does so:
     * @see {@link https://github.com/wintercg/proposal-webcrypto-streams}
     */
    async digest(algorithm, data) {
      const { name, length } = normalizeAlgorithm(algorithm);
      assertValidDigestLength(length);
      const bytes = bufferSourceBytes(data);
      if (FNV_ALGORITHMS.includes(name)) {
        return fnv(name, bytes);
      }
      if (webCryptoDigestAlgorithms.includes(name) && // and the data is a single buffer,
      bytes) {
        return webCrypto.subtle.digest(algorithm, bytes);
      } else if (digestAlgorithms.includes(name)) {
        if (bytes) {
          return stdCrypto.subtle.digestSync(algorithm, bytes);
        } else if (data[Symbol.iterator]) {
          return stdCrypto.subtle.digestSync(algorithm, data);
        } else if (data[Symbol.asyncIterator]) {
          const wasmCrypto = instantiate();
          const context = new wasmCrypto.DigestContext(name);
          for await (const chunk of data) {
            const chunkBytes = bufferSourceBytes(chunk);
            if (!chunkBytes) {
              throw new TypeError("data contained chunk of the wrong type");
            }
            context.update(chunkBytes);
          }
          return context.digestAndDrop(length).buffer;
        } else {
          throw new TypeError("data must be a BufferSource or [Async]Iterable<BufferSource>");
        }
      } else if (webCrypto.subtle?.digest) {
        return webCrypto.subtle.digest(algorithm, data);
      } else {
        throw new TypeError(`unsupported digest algorithm: ${algorithm}`);
      }
    },
    digestSync(algorithm, data) {
      const { name, length } = normalizeAlgorithm(algorithm);
      assertValidDigestLength(length);
      const bytes = bufferSourceBytes(data);
      if (FNV_ALGORITHMS.includes(name)) {
        return fnv(name, bytes);
      }
      const wasmCrypto = instantiate();
      if (bytes) {
        return wasmCrypto.digest(name, bytes, length).buffer;
      } else if (data[Symbol.iterator]) {
        const context = new wasmCrypto.DigestContext(name);
        for (const chunk of data) {
          const chunkBytes = bufferSourceBytes(chunk);
          if (!chunkBytes) {
            throw new TypeError("data contained chunk of the wrong type");
          }
          context.update(chunkBytes);
        }
        return context.digestAndDrop(length).buffer;
      } else {
        throw new TypeError("data must be a BufferSource or Iterable<BufferSource>");
      }
    }
  }
});
var FNV_ALGORITHMS = [
  "FNV32",
  "FNV32A",
  "FNV64",
  "FNV64A"
];
var webCryptoDigestAlgorithms = [
  "SHA-384",
  "SHA-256",
  "SHA-512",
  // insecure (length-extendable and collidable):
  "SHA-1"
];
var MAX_DIGEST_LENGTH = 2147483647;
function assertValidDigestLength(value) {
  if (value !== void 0 && (value < 0 || value > MAX_DIGEST_LENGTH || !Number.isInteger(value))) {
    throw new RangeError(`length must be an integer between 0 and ${MAX_DIGEST_LENGTH}, inclusive`);
  }
}
function normalizeAlgorithm(algorithm) {
  return typeof algorithm === "string" ? {
    name: algorithm.toUpperCase()
  } : {
    ...algorithm,
    name: algorithm.name.toUpperCase()
  };
}

// deno:https://deno.land/std@0.214.0/async/delay.ts
function delay(ms, options = {}) {
  const { signal, persistent } = options;
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve3, reject) => {
    const abort = () => {
      clearTimeout(i);
      reject(signal?.reason);
    };
    const done = () => {
      signal?.removeEventListener("abort", abort);
      resolve3();
    };
    const i = setTimeout(done, ms);
    signal?.addEventListener("abort", abort, {
      once: true
    });
    if (persistent === false) {
      try {
        Deno.unrefTimer(i);
      } catch (error) {
        if (!(error instanceof ReferenceError)) {
          throw error;
        }
        console.error("`persistent` option is only available in Deno");
      }
    }
  });
}

// deno:https://deno.land/std@0.214.0/fmt/colors.ts
var { Deno: Deno2 } = globalThis;
var noColor = typeof Deno2?.noColor === "boolean" ? Deno2.noColor : false;
var enabled = !noColor;
function code(open, close) {
  return {
    open: `\x1B[${open.join(";")}m`,
    close: `\x1B[${close}m`,
    regexp: new RegExp(`\\x1b\\[${close}m`, "g")
  };
}
function run(str, code2) {
  return enabled ? `${code2.open}${str.replace(code2.regexp, code2.open)}${code2.close}` : str;
}
function bold(str) {
  return run(str, code([
    1
  ], 22));
}
function yellow(str) {
  return run(str, code([
    33
  ], 39));
}
function clampAndTruncate(n, max = 255, min = 0) {
  return Math.trunc(Math.max(Math.min(n, max), min));
}
function rgb24(str, color) {
  if (typeof color === "number") {
    return run(str, code([
      38,
      2,
      color >> 16 & 255,
      color >> 8 & 255,
      color & 255
    ], 39));
  }
  return run(str, code([
    38,
    2,
    clampAndTruncate(color.r),
    clampAndTruncate(color.g),
    clampAndTruncate(color.b)
  ], 39));
}
var ANSI_PATTERN = new RegExp([
  "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
  "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TXZcf-nq-uy=><~]))"
].join("|"), "g");

// deno:https://deno.land/std@0.214.0/path/_common/assert_path.ts
function assertPath(path) {
  if (typeof path !== "string") {
    throw new TypeError(`Path must be a string. Received ${JSON.stringify(path)}`);
  }
}

// deno:https://deno.land/std@0.214.0/path/_common/constants.ts
var CHAR_UPPERCASE_A = 65;
var CHAR_LOWERCASE_A = 97;
var CHAR_UPPERCASE_Z = 90;
var CHAR_LOWERCASE_Z = 122;
var CHAR_DOT = 46;
var CHAR_FORWARD_SLASH = 47;
var CHAR_BACKWARD_SLASH = 92;
var CHAR_COLON = 58;

// deno:https://deno.land/std@0.214.0/path/windows/_util.ts
function isPathSeparator(code2) {
  return code2 === CHAR_FORWARD_SLASH || code2 === CHAR_BACKWARD_SLASH;
}
function isWindowsDeviceRoot(code2) {
  return code2 >= CHAR_LOWERCASE_A && code2 <= CHAR_LOWERCASE_Z || code2 >= CHAR_UPPERCASE_A && code2 <= CHAR_UPPERCASE_Z;
}

// deno:https://deno.land/std@0.214.0/path/_common/from_file_url.ts
function assertArg3(url) {
  url = url instanceof URL ? url : new URL(url);
  if (url.protocol !== "file:") {
    throw new TypeError("Must be a file URL.");
  }
  return url;
}

// deno:https://deno.land/std@0.214.0/path/windows/from_file_url.ts
function fromFileUrl(url) {
  url = assertArg3(url);
  let path = decodeURIComponent(url.pathname.replace(/\//g, "\\").replace(/%(?![0-9A-Fa-f]{2})/g, "%25")).replace(/^\\*([A-Za-z]:)(\\|$)/, "$1\\");
  if (url.hostname !== "") {
    path = `\\\\${url.hostname}${path}`;
  }
  return path;
}

// deno:https://deno.land/std@0.214.0/path/windows/is_absolute.ts
function isAbsolute(path) {
  assertPath(path);
  const len = path.length;
  if (len === 0) return false;
  const code2 = path.charCodeAt(0);
  if (isPathSeparator(code2)) {
    return true;
  } else if (isWindowsDeviceRoot(code2)) {
    if (len > 2 && path.charCodeAt(1) === CHAR_COLON) {
      if (isPathSeparator(path.charCodeAt(2))) return true;
    }
  }
  return false;
}

// deno:https://deno.land/std@0.214.0/path/_common/normalize.ts
function assertArg4(path) {
  assertPath(path);
  if (path.length === 0) return ".";
}

// deno:https://deno.land/std@0.214.0/path/_common/normalize_string.ts
function normalizeString(path, allowAboveRoot, separator, isPathSeparator2) {
  let res = "";
  let lastSegmentLength = 0;
  let lastSlash = -1;
  let dots = 0;
  let code2;
  for (let i = 0, len = path.length; i <= len; ++i) {
    if (i < len) code2 = path.charCodeAt(i);
    else if (isPathSeparator2(code2)) break;
    else code2 = CHAR_FORWARD_SLASH;
    if (isPathSeparator2(code2)) {
      if (lastSlash === i - 1 || dots === 1) {
      } else if (lastSlash !== i - 1 && dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== CHAR_DOT || res.charCodeAt(res.length - 2) !== CHAR_DOT) {
          if (res.length > 2) {
            const lastSlashIndex = res.lastIndexOf(separator);
            if (lastSlashIndex === -1) {
              res = "";
              lastSegmentLength = 0;
            } else {
              res = res.slice(0, lastSlashIndex);
              lastSegmentLength = res.length - 1 - res.lastIndexOf(separator);
            }
            lastSlash = i;
            dots = 0;
            continue;
          } else if (res.length === 2 || res.length === 1) {
            res = "";
            lastSegmentLength = 0;
            lastSlash = i;
            dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          if (res.length > 0) res += `${separator}..`;
          else res = "..";
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0) res += separator + path.slice(lastSlash + 1, i);
        else res = path.slice(lastSlash + 1, i);
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i;
      dots = 0;
    } else if (code2 === CHAR_DOT && dots !== -1) {
      ++dots;
    } else {
      dots = -1;
    }
  }
  return res;
}

// deno:https://deno.land/std@0.214.0/path/windows/normalize.ts
function normalize(path) {
  assertArg4(path);
  const len = path.length;
  let rootEnd = 0;
  let device;
  let isAbsolute4 = false;
  const code2 = path.charCodeAt(0);
  if (len > 1) {
    if (isPathSeparator(code2)) {
      isAbsolute4 = true;
      if (isPathSeparator(path.charCodeAt(1))) {
        let j = 2;
        let last = j;
        for (; j < len; ++j) {
          if (isPathSeparator(path.charCodeAt(j))) break;
        }
        if (j < len && j !== last) {
          const firstPart = path.slice(last, j);
          last = j;
          for (; j < len; ++j) {
            if (!isPathSeparator(path.charCodeAt(j))) break;
          }
          if (j < len && j !== last) {
            last = j;
            for (; j < len; ++j) {
              if (isPathSeparator(path.charCodeAt(j))) break;
            }
            if (j === len) {
              return `\\\\${firstPart}\\${path.slice(last)}\\`;
            } else if (j !== last) {
              device = `\\\\${firstPart}\\${path.slice(last, j)}`;
              rootEnd = j;
            }
          }
        }
      } else {
        rootEnd = 1;
      }
    } else if (isWindowsDeviceRoot(code2)) {
      if (path.charCodeAt(1) === CHAR_COLON) {
        device = path.slice(0, 2);
        rootEnd = 2;
        if (len > 2) {
          if (isPathSeparator(path.charCodeAt(2))) {
            isAbsolute4 = true;
            rootEnd = 3;
          }
        }
      }
    }
  } else if (isPathSeparator(code2)) {
    return "\\";
  }
  let tail;
  if (rootEnd < len) {
    tail = normalizeString(path.slice(rootEnd), !isAbsolute4, "\\", isPathSeparator);
  } else {
    tail = "";
  }
  if (tail.length === 0 && !isAbsolute4) tail = ".";
  if (tail.length > 0 && isPathSeparator(path.charCodeAt(len - 1))) {
    tail += "\\";
  }
  if (device === void 0) {
    if (isAbsolute4) {
      if (tail.length > 0) return `\\${tail}`;
      else return "\\";
    } else if (tail.length > 0) {
      return tail;
    } else {
      return "";
    }
  } else if (isAbsolute4) {
    if (tail.length > 0) return `${device}\\${tail}`;
    else return `${device}\\`;
  } else if (tail.length > 0) {
    return device + tail;
  } else {
    return device;
  }
}

// deno:https://deno.land/std@0.214.0/path/windows/join.ts
function join(...paths) {
  if (paths.length === 0) return ".";
  let joined;
  let firstPart = null;
  for (let i = 0; i < paths.length; ++i) {
    const path = paths[i];
    assertPath(path);
    if (path.length > 0) {
      if (joined === void 0) joined = firstPart = path;
      else joined += `\\${path}`;
    }
  }
  if (joined === void 0) return ".";
  let needsReplace = true;
  let slashCount = 0;
  assert(firstPart !== null);
  if (isPathSeparator(firstPart.charCodeAt(0))) {
    ++slashCount;
    const firstLen = firstPart.length;
    if (firstLen > 1) {
      if (isPathSeparator(firstPart.charCodeAt(1))) {
        ++slashCount;
        if (firstLen > 2) {
          if (isPathSeparator(firstPart.charCodeAt(2))) ++slashCount;
          else {
            needsReplace = false;
          }
        }
      }
    }
  }
  if (needsReplace) {
    for (; slashCount < joined.length; ++slashCount) {
      if (!isPathSeparator(joined.charCodeAt(slashCount))) break;
    }
    if (slashCount >= 2) joined = `\\${joined.slice(slashCount)}`;
  }
  return normalize(joined);
}

// deno:https://deno.land/std@0.214.0/path/posix/_util.ts
function isPosixPathSeparator2(code2) {
  return code2 === CHAR_FORWARD_SLASH;
}

// deno:https://deno.land/std@0.214.0/path/posix/from_file_url.ts
function fromFileUrl2(url) {
  url = assertArg3(url);
  return decodeURIComponent(url.pathname.replace(/%(?![0-9A-Fa-f]{2})/g, "%25"));
}

// deno:https://deno.land/std@0.214.0/path/posix/is_absolute.ts
function isAbsolute2(path) {
  assertPath(path);
  return path.length > 0 && isPosixPathSeparator2(path.charCodeAt(0));
}

// deno:https://deno.land/std@0.214.0/path/posix/normalize.ts
function normalize2(path) {
  assertArg4(path);
  const isAbsolute4 = isPosixPathSeparator2(path.charCodeAt(0));
  const trailingSeparator = isPosixPathSeparator2(path.charCodeAt(path.length - 1));
  path = normalizeString(path, !isAbsolute4, "/", isPosixPathSeparator2);
  if (path.length === 0 && !isAbsolute4) path = ".";
  if (path.length > 0 && trailingSeparator) path += "/";
  if (isAbsolute4) return `/${path}`;
  return path;
}

// deno:https://deno.land/std@0.214.0/path/posix/join.ts
function join2(...paths) {
  if (paths.length === 0) return ".";
  let joined;
  for (let i = 0, len = paths.length; i < len; ++i) {
    const path = paths[i];
    assertPath(path);
    if (path.length > 0) {
      if (!joined) joined = path;
      else joined += `/${path}`;
    }
  }
  if (!joined) return ".";
  return normalize2(joined);
}

// deno:https://deno.land/std@0.214.0/path/_os.ts
var osType = (() => {
  const { Deno: Deno3 } = globalThis;
  if (typeof Deno3?.build?.os === "string") {
    return Deno3.build.os;
  }
  const { navigator } = globalThis;
  if (navigator?.appVersion?.includes?.("Win")) {
    return "windows";
  }
  return "linux";
})();
var isWindows = osType === "windows";

// deno:https://deno.land/std@0.214.0/path/from_file_url.ts
function fromFileUrl3(url) {
  return isWindows ? fromFileUrl(url) : fromFileUrl2(url);
}

// deno:https://deno.land/std@0.214.0/path/is_absolute.ts
function isAbsolute3(path) {
  return isWindows ? isAbsolute(path) : isAbsolute2(path);
}

// deno:https://deno.land/std@0.214.0/path/join.ts
function join3(...paths) {
  return isWindows ? join(...paths) : join2(...paths);
}

// deno:https://deno.land/x/postgres@v0.19.3/utils/deferred.ts
var DeferredStack = class {
  #elements;
  #creator;
  #max_size;
  #queue;
  #size;
  constructor(max, ls, creator) {
    this.#elements = ls ? [
      ...ls
    ] : [];
    this.#creator = creator;
    this.#max_size = max || 10;
    this.#queue = [];
    this.#size = this.#elements.length;
  }
  get available() {
    return this.#elements.length;
  }
  async pop() {
    if (this.#elements.length > 0) {
      return this.#elements.pop();
    } else if (this.#size < this.#max_size && this.#creator) {
      this.#size++;
      return await this.#creator();
    }
    const d = Promise.withResolvers();
    this.#queue.push(d);
    return await d.promise;
  }
  push(value) {
    if (this.#queue.length > 0) {
      const d = this.#queue.shift();
      d.resolve(value);
    } else {
      this.#elements.push(value);
    }
  }
  get size() {
    return this.#size;
  }
};
var DeferredAccessStack = class {
  #elements;
  #initializeElement;
  #checkElementInitialization;
  #queue;
  #size;
  get available() {
    return this.#elements.length;
  }
  /**
   * The max number of elements that can be contained in the stack a time
   */
  get size() {
    return this.#size;
  }
  /**
   * @param initialize This function will execute for each element that hasn't been initialized when requested from the stack
   */
  constructor(elements, initCallback, checkInitCallback) {
    this.#checkElementInitialization = checkInitCallback;
    this.#elements = elements;
    this.#initializeElement = initCallback;
    this.#queue = [];
    this.#size = elements.length;
  }
  /**
   * Will execute the check for initialization on each element of the stack
   * and then return the number of initialized elements that pass the check
   */
  async initialized() {
    const initialized = await Promise.all(this.#elements.map((e) => this.#checkElementInitialization(e)));
    return initialized.filter((initialized2) => initialized2 === true).length;
  }
  async pop() {
    let element;
    if (this.available > 0) {
      element = this.#elements.pop();
    } else {
      const d = Promise.withResolvers();
      this.#queue.push(d);
      element = await d.promise;
    }
    if (!await this.#checkElementInitialization(element)) {
      await this.#initializeElement(element);
    }
    return element;
  }
  push(value) {
    if (this.#queue.length > 0) {
      const d = this.#queue.shift();
      d.resolve(value);
    } else {
      this.#elements.push(value);
    }
  }
};

// deno:https://deno.land/x/postgres@v0.19.3/utils/utils.ts
function readInt16BE(buffer, offset) {
  offset = offset >>> 0;
  const val = buffer[offset + 1] | buffer[offset] << 8;
  return val & 32768 ? val | 4294901760 : val;
}
function readInt32BE(buffer, offset) {
  offset = offset >>> 0;
  return buffer[offset] << 24 | buffer[offset + 1] << 16 | buffer[offset + 2] << 8 | buffer[offset + 3];
}
function readUInt32BE(buffer, offset) {
  offset = offset >>> 0;
  return buffer[offset] * 16777216 + (buffer[offset + 1] << 16 | buffer[offset + 2] << 8 | buffer[offset + 3]);
}
function parseConnectionUri(uri) {
  const parsed_uri = uri.match(/(?<driver>\w+):\/{2}((?<user>[^\/?#\s:]+?)?(:(?<password>[^\/?#\s]+)?)?@)?(?<full_host>[^\/?#\s]+)?(\/(?<path>[^?#\s]*))?(\?(?<params>[^#\s]+))?.*/);
  if (!parsed_uri) throw new Error("Could not parse the provided URL");
  let { driver = "", full_host = "", params = "", password = "", path = "", user = "" } = parsed_uri.groups ?? {};
  const parsed_host = full_host.match(/(?<host>(\[.+\])|(.*?))(:(?<port>[\w]*))?$/);
  if (!parsed_host) throw new Error(`Could not parse "${full_host}" host`);
  let { host = "", port = "" } = parsed_host.groups ?? {};
  try {
    if (host) {
      host = decodeURIComponent(host);
    }
  } catch (_e) {
    console.error(bold(yellow("Failed to decode URL host") + "\nDefaulting to raw host"));
  }
  if (port && Number.isNaN(Number(port))) {
    throw new Error(`The provided port "${port}" is not a valid number`);
  }
  try {
    if (password) {
      password = decodeURIComponent(password);
    }
  } catch (_e) {
    console.error(bold(yellow("Failed to decode URL password") + "\nDefaulting to raw password"));
  }
  return {
    driver,
    host,
    params: Object.fromEntries(new URLSearchParams(params).entries()),
    password,
    path,
    port,
    user
  };
}
function isTemplateString(template) {
  if (!Array.isArray(template)) {
    return false;
  }
  return true;
}
var getSocketName = (port) => `.s.PGSQL.${port}`;

// deno:https://deno.land/x/postgres@v0.19.3/connection/packet.ts
var PacketReader = class {
  #buffer;
  #decoder = new TextDecoder();
  #offset = 0;
  constructor(buffer) {
    this.#buffer = buffer;
  }
  readInt16() {
    const value = readInt16BE(this.#buffer, this.#offset);
    this.#offset += 2;
    return value;
  }
  readInt32() {
    const value = readInt32BE(this.#buffer, this.#offset);
    this.#offset += 4;
    return value;
  }
  readByte() {
    return this.readBytes(1)[0];
  }
  readBytes(length) {
    const start = this.#offset;
    const end = start + length;
    const slice = this.#buffer.slice(start, end);
    this.#offset = end;
    return slice;
  }
  readAllBytes() {
    const slice = this.#buffer.slice(this.#offset);
    this.#offset = this.#buffer.length;
    return slice;
  }
  readString(length) {
    const bytes = this.readBytes(length);
    return this.#decoder.decode(bytes);
  }
  readCString() {
    const start = this.#offset;
    const end = this.#buffer.indexOf(0, start);
    const slice = this.#buffer.slice(start, end);
    this.#offset = end + 1;
    return this.#decoder.decode(slice);
  }
};
var PacketWriter = class {
  #buffer;
  #encoder = new TextEncoder();
  #headerPosition;
  #offset;
  #size;
  constructor(size) {
    this.#size = size || 1024;
    this.#buffer = new Uint8Array(this.#size + 5);
    this.#offset = 5;
    this.#headerPosition = 0;
  }
  #ensure(size) {
    const remaining = this.#buffer.length - this.#offset;
    if (remaining < size) {
      const oldBuffer = this.#buffer;
      const newSize = oldBuffer.length + (oldBuffer.length >> 1) + size;
      this.#buffer = new Uint8Array(newSize);
      copy(oldBuffer, this.#buffer);
    }
  }
  addInt32(num) {
    this.#ensure(4);
    this.#buffer[this.#offset++] = num >>> 24 & 255;
    this.#buffer[this.#offset++] = num >>> 16 & 255;
    this.#buffer[this.#offset++] = num >>> 8 & 255;
    this.#buffer[this.#offset++] = num >>> 0 & 255;
    return this;
  }
  addInt16(num) {
    this.#ensure(2);
    this.#buffer[this.#offset++] = num >>> 8 & 255;
    this.#buffer[this.#offset++] = num >>> 0 & 255;
    return this;
  }
  addCString(string) {
    if (!string) {
      this.#ensure(1);
    } else {
      const encodedStr = this.#encoder.encode(string);
      this.#ensure(encodedStr.byteLength + 1);
      copy(encodedStr, this.#buffer, this.#offset);
      this.#offset += encodedStr.byteLength;
    }
    this.#buffer[this.#offset++] = 0;
    return this;
  }
  addChar(c) {
    if (c.length != 1) {
      throw new Error("addChar requires single character strings");
    }
    this.#ensure(1);
    copy(this.#encoder.encode(c), this.#buffer, this.#offset);
    this.#offset++;
    return this;
  }
  addString(string) {
    string = string || "";
    const encodedStr = this.#encoder.encode(string);
    this.#ensure(encodedStr.byteLength);
    copy(encodedStr, this.#buffer, this.#offset);
    this.#offset += encodedStr.byteLength;
    return this;
  }
  add(otherBuffer) {
    this.#ensure(otherBuffer.length);
    copy(otherBuffer, this.#buffer, this.#offset);
    this.#offset += otherBuffer.length;
    return this;
  }
  clear() {
    this.#offset = 5;
    this.#headerPosition = 0;
  }
  // appends a header block to all the written data since the last
  // subsequent header or to the beginning if there is only one data block
  addHeader(code2, last) {
    const origOffset = this.#offset;
    this.#offset = this.#headerPosition;
    this.#buffer[this.#offset++] = code2;
    this.addInt32(origOffset - (this.#headerPosition + 1));
    this.#headerPosition = origOffset;
    this.#offset = origOffset;
    if (!last) {
      this.#ensure(5);
      this.#offset += 5;
    }
    return this;
  }
  join(code2) {
    if (code2) {
      this.addHeader(code2, true);
    }
    return this.#buffer.slice(code2 ? 0 : 5, this.#offset);
  }
  flush(code2) {
    const result = this.join(code2);
    this.clear();
    return result;
  }
};

// deno:https://deno.land/x/postgres@v0.19.3/query/oid.ts
var Oid = {
  bool: 16,
  bytea: 17,
  char: 18,
  name: 19,
  int8: 20,
  int2: 21,
  _int2vector_0: 22,
  int4: 23,
  regproc: 24,
  text: 25,
  oid: 26,
  tid: 27,
  xid: 28,
  _cid_0: 29,
  _oidvector_0: 30,
  _pg_ddl_command: 32,
  _pg_type: 71,
  _pg_attribute: 75,
  _pg_proc: 81,
  _pg_class: 83,
  json: 114,
  _xml_0: 142,
  _xml_1: 143,
  _pg_node_tree: 194,
  json_array: 199,
  _smgr: 210,
  _index_am_handler: 325,
  point: 600,
  lseg: 601,
  path: 602,
  box: 603,
  polygon: 604,
  line: 628,
  line_array: 629,
  cidr: 650,
  cidr_array: 651,
  float4: 700,
  float8: 701,
  _abstime_0: 702,
  _reltime_0: 703,
  _tinterval_0: 704,
  _unknown: 705,
  circle: 718,
  circle_array: 719,
  _money_0: 790,
  _money_1: 791,
  macaddr: 829,
  inet: 869,
  bool_array: 1e3,
  byte_array: 1001,
  char_array: 1002,
  name_array: 1003,
  int2_array: 1005,
  _int2vector_1: 1006,
  int4_array: 1007,
  regproc_array: 1008,
  text_array: 1009,
  tid_array: 1010,
  xid_array: 1011,
  _cid_1: 1012,
  _oidvector_1: 1013,
  bpchar_array: 1014,
  varchar_array: 1015,
  int8_array: 1016,
  point_array: 1017,
  lseg_array: 1018,
  path_array: 1019,
  box_array: 1020,
  float4_array: 1021,
  float8_array: 1022,
  _abstime_1: 1023,
  _reltime_1: 1024,
  _tinterval_1: 1025,
  polygon_array: 1027,
  oid_array: 1028,
  _aclitem_0: 1033,
  _aclitem_1: 1034,
  macaddr_array: 1040,
  inet_array: 1041,
  bpchar: 1042,
  varchar: 1043,
  date: 1082,
  time: 1083,
  timestamp: 1114,
  timestamp_array: 1115,
  date_array: 1182,
  time_array: 1183,
  timestamptz: 1184,
  timestamptz_array: 1185,
  _interval_0: 1186,
  _interval_1: 1187,
  numeric_array: 1231,
  _pg_database: 1248,
  _cstring_0: 1263,
  timetz: 1266,
  timetz_array: 1270,
  _bit_0: 1560,
  _bit_1: 1561,
  _varbit_0: 1562,
  _varbit_1: 1563,
  numeric: 1700,
  _refcursor_0: 1790,
  _refcursor_1: 2201,
  regprocedure: 2202,
  regoper: 2203,
  regoperator: 2204,
  regclass: 2205,
  regtype: 2206,
  regprocedure_array: 2207,
  regoper_array: 2208,
  regoperator_array: 2209,
  regclass_array: 2210,
  regtype_array: 2211,
  _record_0: 2249,
  _cstring_1: 2275,
  _any: 2276,
  _anyarray: 2277,
  void: 2278,
  _trigger: 2279,
  _language_handler: 2280,
  _internal: 2281,
  _opaque: 2282,
  _anyelement: 2283,
  _record_1: 2287,
  _anynonarray: 2776,
  _pg_authid: 2842,
  _pg_auth_members: 2843,
  _txid_snapshot_0: 2949,
  uuid: 2950,
  uuid_array: 2951,
  _txid_snapshot_1: 2970,
  _fdw_handler: 3115,
  _pg_lsn_0: 3220,
  _pg_lsn_1: 3221,
  _tsm_handler: 3310,
  _anyenum: 3500,
  _tsvector_0: 3614,
  _tsquery_0: 3615,
  _gtsvector_0: 3642,
  _tsvector_1: 3643,
  _gtsvector_1: 3644,
  _tsquery_1: 3645,
  regconfig: 3734,
  regconfig_array: 3735,
  regdictionary: 3769,
  regdictionary_array: 3770,
  jsonb: 3802,
  jsonb_array: 3807,
  _anyrange: 3831,
  _event_trigger: 3838,
  _int4range_0: 3904,
  _int4range_1: 3905,
  _numrange_0: 3906,
  _numrange_1: 3907,
  _tsrange_0: 3908,
  _tsrange_1: 3909,
  _tstzrange_0: 3910,
  _tstzrange_1: 3911,
  _daterange_0: 3912,
  _daterange_1: 3913,
  _int8range_0: 3926,
  _int8range_1: 3927,
  _pg_shseclabel: 4066,
  regnamespace: 4089,
  regnamespace_array: 4090,
  regrole: 4096,
  regrole_array: 4097
};
var OidTypes = {
  16: "bool",
  17: "bytea",
  18: "char",
  19: "name",
  20: "int8",
  21: "int2",
  22: "_int2vector_0",
  23: "int4",
  24: "regproc",
  25: "text",
  26: "oid",
  27: "tid",
  28: "xid",
  29: "_cid_0",
  30: "_oidvector_0",
  32: "_pg_ddl_command",
  71: "_pg_type",
  75: "_pg_attribute",
  81: "_pg_proc",
  83: "_pg_class",
  114: "json",
  142: "_xml_0",
  143: "_xml_1",
  194: "_pg_node_tree",
  199: "json_array",
  210: "_smgr",
  325: "_index_am_handler",
  600: "point",
  601: "lseg",
  602: "path",
  603: "box",
  604: "polygon",
  628: "line",
  629: "line_array",
  650: "cidr",
  651: "cidr_array",
  700: "float4",
  701: "float8",
  702: "_abstime_0",
  703: "_reltime_0",
  704: "_tinterval_0",
  705: "_unknown",
  718: "circle",
  719: "circle_array",
  790: "_money_0",
  791: "_money_1",
  829: "macaddr",
  869: "inet",
  1e3: "bool_array",
  1001: "byte_array",
  1002: "char_array",
  1003: "name_array",
  1005: "int2_array",
  1006: "_int2vector_1",
  1007: "int4_array",
  1008: "regproc_array",
  1009: "text_array",
  1010: "tid_array",
  1011: "xid_array",
  1012: "_cid_1",
  1013: "_oidvector_1",
  1014: "bpchar_array",
  1015: "varchar_array",
  1016: "int8_array",
  1017: "point_array",
  1018: "lseg_array",
  1019: "path_array",
  1020: "box_array",
  1021: "float4_array",
  1022: "float8_array",
  1023: "_abstime_1",
  1024: "_reltime_1",
  1025: "_tinterval_1",
  1027: "polygon_array",
  1028: "oid_array",
  1033: "_aclitem_0",
  1034: "_aclitem_1",
  1040: "macaddr_array",
  1041: "inet_array",
  1042: "bpchar",
  1043: "varchar",
  1082: "date",
  1083: "time",
  1114: "timestamp",
  1115: "timestamp_array",
  1182: "date_array",
  1183: "time_array",
  1184: "timestamptz",
  1185: "timestamptz_array",
  1186: "_interval_0",
  1187: "_interval_1",
  1231: "numeric_array",
  1248: "_pg_database",
  1263: "_cstring_0",
  1266: "timetz",
  1270: "timetz_array",
  1560: "_bit_0",
  1561: "_bit_1",
  1562: "_varbit_0",
  1563: "_varbit_1",
  1700: "numeric",
  1790: "_refcursor_0",
  2201: "_refcursor_1",
  2202: "regprocedure",
  2203: "regoper",
  2204: "regoperator",
  2205: "regclass",
  2206: "regtype",
  2207: "regprocedure_array",
  2208: "regoper_array",
  2209: "regoperator_array",
  2210: "regclass_array",
  2211: "regtype_array",
  2249: "_record_0",
  2275: "_cstring_1",
  2276: "_any",
  2277: "_anyarray",
  2278: "void",
  2279: "_trigger",
  2280: "_language_handler",
  2281: "_internal",
  2282: "_opaque",
  2283: "_anyelement",
  2287: "_record_1",
  2776: "_anynonarray",
  2842: "_pg_authid",
  2843: "_pg_auth_members",
  2949: "_txid_snapshot_0",
  2950: "uuid",
  2951: "uuid_array",
  2970: "_txid_snapshot_1",
  3115: "_fdw_handler",
  3220: "_pg_lsn_0",
  3221: "_pg_lsn_1",
  3310: "_tsm_handler",
  3500: "_anyenum",
  3614: "_tsvector_0",
  3615: "_tsquery_0",
  3642: "_gtsvector_0",
  3643: "_tsvector_1",
  3644: "_gtsvector_1",
  3645: "_tsquery_1",
  3734: "regconfig",
  3735: "regconfig_array",
  3769: "regdictionary",
  3770: "regdictionary_array",
  3802: "jsonb",
  3807: "jsonb_array",
  3831: "_anyrange",
  3838: "_event_trigger",
  3904: "_int4range_0",
  3905: "_int4range_1",
  3906: "_numrange_0",
  3907: "_numrange_1",
  3908: "_tsrange_0",
  3909: "_tsrange_1",
  3910: "_tstzrange_0",
  3911: "_tstzrange_1",
  3912: "_daterange_0",
  3913: "_daterange_1",
  3926: "_int8range_0",
  3927: "_int8range_1",
  4066: "_pg_shseclabel",
  4089: "regnamespace",
  4090: "regnamespace_array",
  4096: "regrole",
  4097: "regrole_array"
};

// deno:https://deno.land/x/postgres@v0.19.3/query/array_parser.ts
function parseArray(source, transform, separator = ",") {
  return new ArrayParser(source, transform, separator).parse();
}
var ArrayParser = class _ArrayParser {
  source;
  transform;
  separator;
  position;
  entries;
  recorded;
  dimension;
  constructor(source, transform, separator) {
    this.source = source;
    this.transform = transform;
    this.separator = separator;
    this.position = 0;
    this.entries = [];
    this.recorded = [];
    this.dimension = 0;
  }
  isEof() {
    return this.position >= this.source.length;
  }
  nextCharacter() {
    const character = this.source[this.position++];
    if (character === "\\") {
      return {
        escaped: true,
        value: this.source[this.position++]
      };
    }
    return {
      escaped: false,
      value: character
    };
  }
  record(character) {
    this.recorded.push(character);
  }
  newEntry(includeEmpty = false) {
    let entry;
    if (this.recorded.length > 0 || includeEmpty) {
      entry = this.recorded.join("");
      if (entry === "NULL" && !includeEmpty) {
        entry = null;
      }
      if (entry !== null) entry = this.transform(entry);
      this.entries.push(entry);
      this.recorded = [];
    }
  }
  consumeDimensions() {
    if (this.source[0] === "[") {
      while (!this.isEof()) {
        const char = this.nextCharacter();
        if (char.value === "=") break;
      }
    }
  }
  parse(nested = false) {
    let character, parser, quote;
    this.consumeDimensions();
    while (!this.isEof()) {
      character = this.nextCharacter();
      if (character.value === "{" && !quote) {
        this.dimension++;
        if (this.dimension > 1) {
          parser = new _ArrayParser(this.source.substr(this.position - 1), this.transform, this.separator);
          this.entries.push(parser.parse(true));
          this.position += parser.position - 2;
        }
      } else if (character.value === "}" && !quote) {
        this.dimension--;
        if (!this.dimension) {
          this.newEntry();
          if (nested) return this.entries;
        }
      } else if (character.value === '"' && !character.escaped) {
        if (quote) this.newEntry(true);
        quote = !quote;
      } else if (character.value === this.separator && !quote) {
        this.newEntry();
      } else {
        this.record(character.value);
      }
    }
    if (this.dimension !== 0) {
      throw new Error("array dimension not balanced");
    }
    return this.entries;
  }
};

// deno:https://deno.land/x/postgres@v0.19.3/query/decoders.ts
var BACKSLASH_BYTE_VALUE = 92;
var BC_RE = /BC$/;
var DATETIME_RE = /^(\d{1,})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?/;
var HEX = 16;
var HEX_PREFIX_REGEX = /^\\x/;
var TIMEZONE_RE = /([Z+-])(\d{2})?:?(\d{2})?:?(\d{2})?/;
function decodeBigint(value) {
  return BigInt(value);
}
function decodeBigintArray(value) {
  return parseArray(value, decodeBigint);
}
function decodeBoolean(value) {
  const v = value.toLowerCase();
  return v === "t" || v === "true" || v === "y" || v === "yes" || v === "on" || v === "1";
}
function decodeBooleanArray(value) {
  return parseArray(value, decodeBoolean);
}
function decodeBox(value) {
  const points = value.match(/\(.*?\)/g) || [];
  if (points.length !== 2) {
    throw new Error(`Invalid Box: "${value}". Box must have only 2 point, ${points.length} given.`);
  }
  const [a, b] = points;
  try {
    return {
      a: decodePoint(a),
      b: decodePoint(b)
    };
  } catch (e) {
    throw new Error(`Invalid Box: "${value}" : ${e.message}`);
  }
}
function decodeBoxArray(value) {
  return parseArray(value, decodeBox, ";");
}
function decodeBytea(byteaStr) {
  if (HEX_PREFIX_REGEX.test(byteaStr)) {
    return decodeByteaHex(byteaStr);
  } else {
    return decodeByteaEscape(byteaStr);
  }
}
function decodeByteaArray(value) {
  return parseArray(value, decodeBytea);
}
function decodeByteaEscape(byteaStr) {
  const bytes = [];
  let i = 0;
  let k = 0;
  while (i < byteaStr.length) {
    if (byteaStr[i] !== "\\") {
      bytes.push(byteaStr.charCodeAt(i));
      ++i;
    } else {
      if (/[0-7]{3}/.test(byteaStr.substr(i + 1, 3))) {
        bytes.push(parseInt(byteaStr.substr(i + 1, 3), 8));
        i += 4;
      } else {
        let backslashes = 1;
        while (i + backslashes < byteaStr.length && byteaStr[i + backslashes] === "\\") {
          backslashes++;
        }
        for (k = 0; k < Math.floor(backslashes / 2); ++k) {
          bytes.push(BACKSLASH_BYTE_VALUE);
        }
        i += Math.floor(backslashes / 2) * 2;
      }
    }
  }
  return new Uint8Array(bytes);
}
function decodeByteaHex(byteaStr) {
  const bytesStr = byteaStr.slice(2);
  const bytes = new Uint8Array(bytesStr.length / 2);
  for (let i = 0, j = 0; i < bytesStr.length; i += 2, j++) {
    bytes[j] = parseInt(bytesStr[i] + bytesStr[i + 1], HEX);
  }
  return bytes;
}
function decodeCircle(value) {
  const [point, radius] = value.substring(1, value.length - 1).split(/,(?![^(]*\))/);
  if (Number.isNaN(parseFloat(radius))) {
    throw new Error(`Invalid Circle: "${value}". Circle radius "${radius}" must be a valid number.`);
  }
  try {
    return {
      point: decodePoint(point),
      radius
    };
  } catch (e) {
    throw new Error(`Invalid Circle: "${value}" : ${e.message}`);
  }
}
function decodeCircleArray(value) {
  return parseArray(value, decodeCircle);
}
function decodeDate(dateStr) {
  if (dateStr === "infinity") {
    return Number(Infinity);
  } else if (dateStr === "-infinity") {
    return Number(-Infinity);
  }
  return parse(dateStr, "yyyy-MM-dd");
}
function decodeDateArray(value) {
  return parseArray(value, decodeDate);
}
function decodeDatetime(dateStr) {
  const matches = DATETIME_RE.exec(dateStr);
  if (!matches) {
    return decodeDate(dateStr);
  }
  const isBC = BC_RE.test(dateStr);
  const year = parseInt(matches[1], 10) * (isBC ? -1 : 1);
  const month = parseInt(matches[2], 10) - 1;
  const day = parseInt(matches[3], 10);
  const hour = parseInt(matches[4], 10);
  const minute = parseInt(matches[5], 10);
  const second = parseInt(matches[6], 10);
  const msMatch = matches[7];
  const ms = msMatch ? 1e3 * parseFloat(msMatch) : 0;
  let date;
  const offset = decodeTimezoneOffset(dateStr);
  if (offset === null) {
    date = new Date(year, month, day, hour, minute, second, ms);
  } else {
    const utc = Date.UTC(year, month, day, hour, minute, second, ms);
    date = new Date(utc + offset);
  }
  date.setUTCFullYear(year);
  return date;
}
function decodeDatetimeArray(value) {
  return parseArray(value, decodeDatetime);
}
function decodeInt(value) {
  return parseInt(value, 10);
}
function decodeIntArray(value) {
  return parseArray(value, decodeInt);
}
function decodeFloat(value) {
  return parseFloat(value);
}
function decodeFloatArray(value) {
  return parseArray(value, decodeFloat);
}
function decodeJson(value) {
  return JSON.parse(value);
}
function decodeJsonArray(value) {
  return parseArray(value, JSON.parse);
}
function decodeLine(value) {
  const equationConsts = value.substring(1, value.length - 1).split(",");
  if (equationConsts.length !== 3) {
    throw new Error(`Invalid Line: "${value}". Line in linear equation format must have 3 constants, ${equationConsts.length} given.`);
  }
  equationConsts.forEach((c2) => {
    if (Number.isNaN(parseFloat(c2))) {
      throw new Error(`Invalid Line: "${value}". Line constant "${c2}" must be a valid number.`);
    }
  });
  const [a, b, c] = equationConsts;
  return {
    a,
    b,
    c
  };
}
function decodeLineArray(value) {
  return parseArray(value, decodeLine);
}
function decodeLineSegment(value) {
  const points = value.substring(1, value.length - 1).match(/\(.*?\)/g) || [];
  if (points.length !== 2) {
    throw new Error(`Invalid Line Segment: "${value}". Line segments must have only 2 point, ${points.length} given.`);
  }
  const [a, b] = points;
  try {
    return {
      a: decodePoint(a),
      b: decodePoint(b)
    };
  } catch (e) {
    throw new Error(`Invalid Line Segment: "${value}" : ${e.message}`);
  }
}
function decodeLineSegmentArray(value) {
  return parseArray(value, decodeLineSegment);
}
function decodePath(value) {
  const points = value.substring(1, value.length - 1).split(/,(?![^(]*\))/);
  return points.map((point) => {
    try {
      return decodePoint(point);
    } catch (e) {
      throw new Error(`Invalid Path: "${value}" : ${e.message}`);
    }
  });
}
function decodePathArray(value) {
  return parseArray(value, decodePath);
}
function decodePoint(value) {
  const coordinates = value.substring(1, value.length - 1).split(",");
  if (coordinates.length !== 2) {
    throw new Error(`Invalid Point: "${value}". Points must have only 2 coordinates, ${coordinates.length} given.`);
  }
  const [x, y] = coordinates;
  if (Number.isNaN(parseFloat(x)) || Number.isNaN(parseFloat(y))) {
    throw new Error(`Invalid Point: "${value}". Coordinate "${Number.isNaN(parseFloat(x)) ? x : y}" must be a valid number.`);
  }
  return {
    x,
    y
  };
}
function decodePointArray(value) {
  return parseArray(value, decodePoint);
}
function decodePolygon(value) {
  try {
    return decodePath(value);
  } catch (e) {
    throw new Error(`Invalid Polygon: "${value}" : ${e.message}`);
  }
}
function decodePolygonArray(value) {
  return parseArray(value, decodePolygon);
}
function decodeStringArray(value) {
  if (!value) return null;
  return parseArray(value, (value2) => value2);
}
function decodeTimezoneOffset(dateStr) {
  const timeStr = dateStr.split(" ")[1];
  const matches = TIMEZONE_RE.exec(timeStr);
  if (!matches) {
    return null;
  }
  const type = matches[1];
  if (type === "Z") {
    return 0;
  }
  const sign = type === "-" ? 1 : -1;
  const hours = parseInt(matches[2], 10);
  const minutes = parseInt(matches[3] || "0", 10);
  const seconds = parseInt(matches[4] || "0", 10);
  const offset = hours * 3600 + minutes * 60 + seconds;
  return sign * offset * 1e3;
}
function decodeTid(value) {
  const [x, y] = value.substring(1, value.length - 1).split(",");
  return [
    BigInt(x),
    BigInt(y)
  ];
}
function decodeTidArray(value) {
  return parseArray(value, decodeTid);
}

// deno:https://deno.land/x/postgres@v0.19.3/query/decode.ts
var Column = class {
  name;
  tableOid;
  index;
  typeOid;
  columnLength;
  typeModifier;
  format;
  constructor(name, tableOid, index, typeOid, columnLength, typeModifier, format3) {
    this.name = name;
    this.tableOid = tableOid;
    this.index = index;
    this.typeOid = typeOid;
    this.columnLength = columnLength;
    this.typeModifier = typeModifier;
    this.format = format3;
  }
};
var Format = /* @__PURE__ */ function(Format2) {
  Format2[Format2["TEXT"] = 0] = "TEXT";
  Format2[Format2["BINARY"] = 1] = "BINARY";
  return Format2;
}(Format || {});
var decoder = new TextDecoder();
function decodeBinary() {
  throw new Error("Decoding binary data is not implemented!");
}
function decodeText(value, typeOid) {
  try {
    switch (typeOid) {
      case Oid.bpchar:
      case Oid.char:
      case Oid.cidr:
      case Oid.float8:
      case Oid.inet:
      case Oid.macaddr:
      case Oid.name:
      case Oid.numeric:
      case Oid.oid:
      case Oid.regclass:
      case Oid.regconfig:
      case Oid.regdictionary:
      case Oid.regnamespace:
      case Oid.regoper:
      case Oid.regoperator:
      case Oid.regproc:
      case Oid.regprocedure:
      case Oid.regrole:
      case Oid.regtype:
      case Oid.text:
      case Oid.time:
      case Oid.timetz:
      case Oid.uuid:
      case Oid.varchar:
      case Oid.void:
        return value;
      case Oid.bpchar_array:
      case Oid.char_array:
      case Oid.cidr_array:
      case Oid.float8_array:
      case Oid.inet_array:
      case Oid.macaddr_array:
      case Oid.name_array:
      case Oid.numeric_array:
      case Oid.oid_array:
      case Oid.regclass_array:
      case Oid.regconfig_array:
      case Oid.regdictionary_array:
      case Oid.regnamespace_array:
      case Oid.regoper_array:
      case Oid.regoperator_array:
      case Oid.regproc_array:
      case Oid.regprocedure_array:
      case Oid.regrole_array:
      case Oid.regtype_array:
      case Oid.text_array:
      case Oid.time_array:
      case Oid.timetz_array:
      case Oid.uuid_array:
      case Oid.varchar_array:
        return decodeStringArray(value);
      case Oid.float4:
        return decodeFloat(value);
      case Oid.float4_array:
        return decodeFloatArray(value);
      case Oid.int2:
      case Oid.int4:
      case Oid.xid:
        return decodeInt(value);
      case Oid.int2_array:
      case Oid.int4_array:
      case Oid.xid_array:
        return decodeIntArray(value);
      case Oid.bool:
        return decodeBoolean(value);
      case Oid.bool_array:
        return decodeBooleanArray(value);
      case Oid.box:
        return decodeBox(value);
      case Oid.box_array:
        return decodeBoxArray(value);
      case Oid.circle:
        return decodeCircle(value);
      case Oid.circle_array:
        return decodeCircleArray(value);
      case Oid.bytea:
        return decodeBytea(value);
      case Oid.byte_array:
        return decodeByteaArray(value);
      case Oid.date:
        return decodeDate(value);
      case Oid.date_array:
        return decodeDateArray(value);
      case Oid.int8:
        return decodeBigint(value);
      case Oid.int8_array:
        return decodeBigintArray(value);
      case Oid.json:
      case Oid.jsonb:
        return decodeJson(value);
      case Oid.json_array:
      case Oid.jsonb_array:
        return decodeJsonArray(value);
      case Oid.line:
        return decodeLine(value);
      case Oid.line_array:
        return decodeLineArray(value);
      case Oid.lseg:
        return decodeLineSegment(value);
      case Oid.lseg_array:
        return decodeLineSegmentArray(value);
      case Oid.path:
        return decodePath(value);
      case Oid.path_array:
        return decodePathArray(value);
      case Oid.point:
        return decodePoint(value);
      case Oid.point_array:
        return decodePointArray(value);
      case Oid.polygon:
        return decodePolygon(value);
      case Oid.polygon_array:
        return decodePolygonArray(value);
      case Oid.tid:
        return decodeTid(value);
      case Oid.tid_array:
        return decodeTidArray(value);
      case Oid.timestamp:
      case Oid.timestamptz:
        return decodeDatetime(value);
      case Oid.timestamp_array:
      case Oid.timestamptz_array:
        return decodeDatetimeArray(value);
      default:
        return value;
    }
  } catch (_e) {
    console.error(bold(yellow(`Error decoding type Oid ${typeOid} value`)) + _e.message + "\n" + bold("Defaulting to null."));
    return null;
  }
}
function decode(value, column, controls) {
  const strValue = decoder.decode(value);
  if (controls?.decoders) {
    const oidType = OidTypes[column.typeOid];
    const decoderFunc = controls.decoders?.[column.typeOid] || controls.decoders?.[oidType];
    if (decoderFunc) {
      return decoderFunc(strValue, column.typeOid, parseArray);
    } else if (oidType?.includes("_array")) {
      const baseOidType = oidType.replace("_array", "");
      if (baseOidType in Oid) {
        const decoderFunc2 = controls.decoders?.[Oid[baseOidType]] || controls.decoders?.[baseOidType];
        if (decoderFunc2) {
          return parseArray(strValue, (value2) => decoderFunc2(value2, column.typeOid, parseArray));
        }
      }
    }
  }
  if (controls?.decodeStrategy === "string") {
    return strValue;
  }
  if (column.format === Format.BINARY) {
    return decodeBinary();
  } else if (column.format === Format.TEXT) {
    return decodeText(strValue, column.typeOid);
  } else {
    throw new Error(`Unknown column format: ${column.format}`);
  }
}

// deno:https://deno.land/x/postgres@v0.19.3/query/encode.ts
function pad(number, digits2) {
  let padded = "" + number;
  while (padded.length < digits2) {
    padded = "0" + padded;
  }
  return padded;
}
function encodeDate(date) {
  const year = pad(date.getFullYear(), 4);
  const month = pad(date.getMonth() + 1, 2);
  const day = pad(date.getDate(), 2);
  const hour = pad(date.getHours(), 2);
  const min = pad(date.getMinutes(), 2);
  const sec = pad(date.getSeconds(), 2);
  const ms = pad(date.getMilliseconds(), 3);
  const encodedDate = `${year}-${month}-${day}T${hour}:${min}:${sec}.${ms}`;
  const offset = date.getTimezoneOffset();
  const tzSign = offset > 0 ? "-" : "+";
  const absOffset = Math.abs(offset);
  const tzHours = pad(Math.floor(absOffset / 60), 2);
  const tzMinutes = pad(Math.floor(absOffset % 60), 2);
  const encodedTz = `${tzSign}${tzHours}:${tzMinutes}`;
  return encodedDate + encodedTz;
}
function escapeArrayElement(value) {
  const strValue = value.toString();
  const escapedValue = strValue.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escapedValue}"`;
}
function encodeArray(array) {
  let encodedArray = "{";
  array.forEach((element, index) => {
    if (index > 0) {
      encodedArray += ",";
    }
    if (element === null || typeof element === "undefined") {
      encodedArray += "NULL";
    } else if (Array.isArray(element)) {
      encodedArray += encodeArray(element);
    } else if (element instanceof Uint8Array) {
      throw new Error("Can't encode array of buffers.");
    } else {
      const encodedElement = encodeArgument(element);
      encodedArray += escapeArrayElement(encodedElement);
    }
  });
  encodedArray += "}";
  return encodedArray;
}
function encodeBytes(value) {
  const hex = Array.from(value).map((val) => val < 16 ? `0${val.toString(16)}` : val.toString(16)).join("");
  return `\\x${hex}`;
}
function encodeArgument(value) {
  if (value === null || typeof value === "undefined") {
    return null;
  } else if (value instanceof Uint8Array) {
    return encodeBytes(value);
  } else if (value instanceof Date) {
    return encodeDate(value);
  } else if (value instanceof Array) {
    return encodeArray(value);
  } else if (value instanceof Object) {
    return JSON.stringify(value);
  } else {
    return String(value);
  }
}

// deno:https://deno.land/x/postgres@v0.19.3/query/query.ts
var commandTagRegexp = /^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/;
var ResultType = /* @__PURE__ */ function(ResultType2) {
  ResultType2[ResultType2["ARRAY"] = 0] = "ARRAY";
  ResultType2[ResultType2["OBJECT"] = 1] = "OBJECT";
  return ResultType2;
}({});
var RowDescription = class {
  columnCount;
  columns;
  /** Create a new row description */
  constructor(columnCount, columns) {
    this.columnCount = columnCount;
    this.columns = columns;
  }
};
function templateStringToQuery(template, args, result_type) {
  const text = template.reduce((curr, next, index) => {
    return `${curr}$${index}${next}`;
  });
  return new Query(text, result_type, args);
}
function objectQueryToQueryArgs(query, args) {
  args = normalizeObjectQueryArgs(args);
  let counter = 0;
  const clean_args = [];
  const clean_query = query.replaceAll(/(?<=\$)\w+/g, (match) => {
    match = match.toLowerCase();
    if (match in args) {
      clean_args.push(args[match]);
    } else {
      throw new Error(`No value was provided for the query argument "${match}"`);
    }
    return String(++counter);
  });
  return [
    clean_query,
    clean_args
  ];
}
function normalizeObjectQueryArgs(args) {
  const normalized_args = Object.fromEntries(Object.entries(args).map(([key, value]) => [
    key.toLowerCase(),
    value
  ]));
  if (Object.keys(normalized_args).length !== Object.keys(args).length) {
    throw new Error("The arguments provided for the query must be unique (insensitive)");
  }
  return normalized_args;
}
var QueryResult = class {
  query;
  /**
   * Type of query executed for this result
   */
  command;
  /**
   * The amount of rows affected by the query
   */
  // TODO change to affectedRows
  rowCount;
  /**
   * This variable will be set after the class initialization, however it's required to be set
   * in order to handle result rows coming in
   */
  #row_description;
  /**
   * The warnings of the result
   */
  warnings;
  /**
   * The row description of the result
   */
  get rowDescription() {
    return this.#row_description;
  }
  set rowDescription(row_description) {
    if (row_description && !this.#row_description) {
      this.#row_description = row_description;
    }
  }
  /**
   * Create a query result instance for the query passed
   */
  constructor(query) {
    this.query = query;
    this.warnings = [];
  }
  /**
   * This function is required to parse each column
   * of the results
   */
  loadColumnDescriptions(description) {
    this.rowDescription = description;
  }
  /**
   * Handles the command complete message
   */
  handleCommandComplete(commandTag) {
    const match = commandTagRegexp.exec(commandTag);
    if (match) {
      this.command = match[1];
      if (match[3]) {
        this.rowCount = parseInt(match[3], 10);
      } else {
        this.rowCount = parseInt(match[2], 10);
      }
    }
  }
  /**
   * Add a row to the result based on metadata provided by `rowDescription`
   * This implementation depends on row description not being modified after initialization
   *
   * This function can throw on validation, so any errors must be handled in the message loop accordingly
   */
  insertRow(_row) {
    throw new Error("No implementation for insertRow is defined");
  }
};
var QueryArrayResult = class extends QueryResult {
  /**
   * The result rows
   */
  rows = [];
  /**
   * Insert a row into the result
   */
  insertRow(row_data, controls) {
    if (!this.rowDescription) {
      throw new Error("The row descriptions required to parse the result data weren't initialized");
    }
    const row = row_data.map((raw_value, index) => {
      const column = this.rowDescription.columns[index];
      if (raw_value === null) {
        return null;
      }
      return decode(raw_value, column, controls);
    });
    this.rows.push(row);
  }
};
function findDuplicatesInArray(array) {
  return array.reduce((duplicates, item, index) => {
    const is_duplicate = array.indexOf(item) !== index;
    if (is_duplicate && !duplicates.includes(item)) {
      duplicates.push(item);
    }
    return duplicates;
  }, []);
}
function snakecaseToCamelcase(input) {
  return input.split("_").reduce((res, word, i) => {
    if (i !== 0) {
      word = word[0].toUpperCase() + word.slice(1);
    }
    res += word;
    return res;
  }, "");
}
var QueryObjectResult = class extends QueryResult {
  /**
   * The column names will be undefined on the first run of insertRow, since
   */
  columns;
  /**
   * The rows of the result
   */
  rows = [];
  /**
   * Insert a row into the result
   */
  insertRow(row_data, controls) {
    if (!this.rowDescription) {
      throw new Error("The row description required to parse the result data wasn't initialized");
    }
    if (!this.columns) {
      if (this.query.fields) {
        if (this.rowDescription.columns.length !== this.query.fields.length) {
          throw new RangeError(`The fields provided for the query don't match the ones returned as a result (${this.rowDescription.columns.length} expected, ${this.query.fields.length} received)`);
        }
        this.columns = this.query.fields;
      } else {
        let column_names;
        if (this.query.camelCase) {
          column_names = this.rowDescription.columns.map((column) => snakecaseToCamelcase(column.name));
        } else {
          column_names = this.rowDescription.columns.map((column) => column.name);
        }
        const duplicates = findDuplicatesInArray(column_names);
        if (duplicates.length) {
          throw new Error(`Field names ${duplicates.map((str) => `"${str}"`).join(", ")} are duplicated in the result of the query`);
        }
        this.columns = column_names;
      }
    }
    const columns = this.columns;
    if (columns.length !== row_data.length) {
      throw new RangeError("The result fields returned by the database don't match the defined structure of the result");
    }
    const row = row_data.reduce((row2, raw_value, index) => {
      const current_column = this.rowDescription.columns[index];
      if (raw_value === null) {
        row2[columns[index]] = null;
      } else {
        row2[columns[index]] = decode(raw_value, current_column, controls);
      }
      return row2;
    }, {});
    this.rows.push(row);
  }
};
var Query = class {
  args;
  camelCase;
  /**
   * The explicitly set fields for the query result, they have been validated beforehand
   * for duplicates and invalid names
   */
  fields;
  // TODO
  // Should be private
  result_type;
  // TODO
  // Document that this text is the one sent to the database, not the original one
  text;
  constructor(config_or_text, result_type, args = []) {
    this.result_type = result_type;
    if (typeof config_or_text === "string") {
      if (!Array.isArray(args)) {
        [config_or_text, args] = objectQueryToQueryArgs(config_or_text, args);
      }
      this.text = config_or_text;
      this.args = args.map(encodeArgument);
    } else {
      const { camelCase, encoder: encoder4 = encodeArgument, fields } = config_or_text;
      let { args: args2 = [], text } = config_or_text;
      if (fields) {
        const fields_are_clean = fields.every((field) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field));
        if (!fields_are_clean) {
          throw new TypeError("The fields provided for the query must contain only letters and underscores");
        }
        if (new Set(fields).size !== fields.length) {
          throw new TypeError("The fields provided for the query must be unique");
        }
        this.fields = fields;
      }
      this.camelCase = camelCase;
      if (!Array.isArray(args2)) {
        [text, args2] = objectQueryToQueryArgs(text, args2);
      }
      this.args = args2.map(encoder4);
      this.text = text;
    }
  }
};

// deno:https://deno.land/x/postgres@v0.19.3/connection/message.ts
var Message = class {
  type;
  byteCount;
  body;
  reader;
  constructor(type, byteCount, body) {
    this.type = type;
    this.byteCount = byteCount;
    this.body = body;
    this.reader = new PacketReader(body);
  }
};
function parseBackendKeyMessage(message) {
  return {
    pid: message.reader.readInt32(),
    secret_key: message.reader.readInt32()
  };
}
function parseCommandCompleteMessage(message) {
  return message.reader.readString(message.byteCount);
}
function parseNoticeMessage(message) {
  const error_fields = {};
  let byte;
  let field_code;
  let field_value;
  while (byte = message.reader.readByte()) {
    field_code = String.fromCharCode(byte);
    field_value = message.reader.readCString();
    switch (field_code) {
      case "S":
        error_fields.severity = field_value;
        break;
      case "C":
        error_fields.code = field_value;
        break;
      case "M":
        error_fields.message = field_value;
        break;
      case "D":
        error_fields.detail = field_value;
        break;
      case "H":
        error_fields.hint = field_value;
        break;
      case "P":
        error_fields.position = field_value;
        break;
      case "p":
        error_fields.internalPosition = field_value;
        break;
      case "q":
        error_fields.internalQuery = field_value;
        break;
      case "W":
        error_fields.where = field_value;
        break;
      case "s":
        error_fields.schema = field_value;
        break;
      case "t":
        error_fields.table = field_value;
        break;
      case "c":
        error_fields.column = field_value;
        break;
      case "d":
        error_fields.dataTypeName = field_value;
        break;
      case "n":
        error_fields.constraint = field_value;
        break;
      case "F":
        error_fields.file = field_value;
        break;
      case "L":
        error_fields.line = field_value;
        break;
      case "R":
        error_fields.routine = field_value;
        break;
      default:
        break;
    }
  }
  return error_fields;
}
function parseRowDataMessage(message) {
  const field_count = message.reader.readInt16();
  const row = [];
  for (let i = 0; i < field_count; i++) {
    const col_length = message.reader.readInt32();
    if (col_length == -1) {
      row.push(null);
      continue;
    }
    row.push(message.reader.readBytes(col_length));
  }
  return row;
}
function parseRowDescriptionMessage(message) {
  const column_count = message.reader.readInt16();
  const columns = [];
  for (let i = 0; i < column_count; i++) {
    const column = new Column(message.reader.readCString(), message.reader.readInt32(), message.reader.readInt16(), message.reader.readInt32(), message.reader.readInt16(), message.reader.readInt32(), message.reader.readInt16());
    columns.push(column);
  }
  return new RowDescription(column_count, columns);
}

// deno:https://deno.land/x/postgres@v0.19.3/connection/scram.ts
var defaultNonceSize = 16;
var text_encoder = new TextEncoder();
var AuthenticationState = /* @__PURE__ */ function(AuthenticationState2) {
  AuthenticationState2[AuthenticationState2["Init"] = 0] = "Init";
  AuthenticationState2[AuthenticationState2["ClientChallenge"] = 1] = "ClientChallenge";
  AuthenticationState2[AuthenticationState2["ServerChallenge"] = 2] = "ServerChallenge";
  AuthenticationState2[AuthenticationState2["ClientResponse"] = 3] = "ClientResponse";
  AuthenticationState2[AuthenticationState2["ServerResponse"] = 4] = "ServerResponse";
  AuthenticationState2[AuthenticationState2["Failed"] = 5] = "Failed";
  return AuthenticationState2;
}(AuthenticationState || {});
var Reason = /* @__PURE__ */ function(Reason2) {
  Reason2["BadMessage"] = "server sent an ill-formed message";
  Reason2["BadServerNonce"] = "server sent an invalid nonce";
  Reason2["BadSalt"] = "server specified an invalid salt";
  Reason2["BadIterationCount"] = "server specified an invalid iteration count";
  Reason2["BadVerifier"] = "server sent a bad verifier";
  Reason2["Rejected"] = "rejected by server";
  return Reason2;
}({});
function assert2(cond) {
  if (!cond) {
    throw new Error("Scram protocol assertion failed");
  }
}
function assertValidScramString(str) {
  const unsafe = /[^\x21-\x7e]/;
  if (unsafe.test(str)) {
    throw new Error("scram username/password is currently limited to safe ascii characters");
  }
}
async function computeScramSignature(message, raw_key) {
  const key = await crypto.subtle.importKey("raw", raw_key, {
    name: "HMAC",
    hash: "SHA-256"
  }, false, [
    "sign"
  ]);
  return new Uint8Array(await crypto.subtle.sign({
    name: "HMAC",
    hash: "SHA-256"
  }, key, text_encoder.encode(message)));
}
function computeScramProof(signature, key) {
  const digest2 = new Uint8Array(signature.length);
  for (let i = 0; i < digest2.length; i++) {
    digest2[i] = signature[i] ^ key[i];
  }
  return digest2;
}
async function deriveKeySignatures(password, salt, iterations) {
  const pbkdf2_password = await crypto.subtle.importKey("raw", text_encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
    "deriveKey"
  ]);
  const key = await crypto.subtle.deriveKey({
    hash: "SHA-256",
    iterations,
    name: "PBKDF2",
    salt
  }, pbkdf2_password, {
    name: "HMAC",
    hash: "SHA-256",
    length: 256
  }, false, [
    "sign"
  ]);
  const client = new Uint8Array(await crypto.subtle.sign("HMAC", key, text_encoder.encode("Client Key")));
  const server = new Uint8Array(await crypto.subtle.sign("HMAC", key, text_encoder.encode("Server Key")));
  const stored = new Uint8Array(await crypto.subtle.digest("SHA-256", client));
  return {
    client,
    server,
    stored
  };
}
function escape(str) {
  return str.replace(/=/g, "=3D").replace(/,/g, "=2C");
}
function generateRandomNonce(size) {
  return base64_exports.encodeBase64(crypto.getRandomValues(new Uint8Array(size)));
}
function parseScramAttributes(message) {
  const attrs = {};
  for (const entry of message.split(",")) {
    const pos = entry.indexOf("=");
    if (pos < 1) {
      throw new Error(Reason.BadMessage);
    }
    const key = entry.substr(0, pos);
    const value = entry.substr(pos + 1);
    attrs[key] = value;
  }
  return attrs;
}
var Client = class {
  #auth_message;
  #client_nonce;
  #key_signatures;
  #password;
  #server_nonce;
  #state;
  #username;
  constructor(username, password, nonce) {
    assertValidScramString(password);
    assertValidScramString(username);
    this.#auth_message = "";
    this.#client_nonce = nonce ?? generateRandomNonce(defaultNonceSize);
    this.#password = password;
    this.#state = AuthenticationState.Init;
    this.#username = escape(username);
  }
  /**
   * Composes client-first-message
   */
  composeChallenge() {
    assert2(this.#state === AuthenticationState.Init);
    try {
      const header = "n,,";
      const challenge = `n=${this.#username},r=${this.#client_nonce}`;
      const message = header + challenge;
      this.#auth_message += challenge;
      this.#state = AuthenticationState.ClientChallenge;
      return message;
    } catch (e) {
      this.#state = AuthenticationState.Failed;
      throw e;
    }
  }
  /**
   * Processes server-first-message
   */
  async receiveChallenge(challenge) {
    assert2(this.#state === AuthenticationState.ClientChallenge);
    try {
      const attrs = parseScramAttributes(challenge);
      const nonce = attrs.r;
      if (!attrs.r || !attrs.r.startsWith(this.#client_nonce)) {
        throw new Error(Reason.BadServerNonce);
      }
      this.#server_nonce = nonce;
      let salt;
      if (!attrs.s) {
        throw new Error(Reason.BadSalt);
      }
      try {
        salt = base64_exports.decodeBase64(attrs.s);
      } catch {
        throw new Error(Reason.BadSalt);
      }
      if (!salt) throw new Error(Reason.BadSalt);
      const iterCount = parseInt(attrs.i) | 0;
      if (iterCount <= 0) {
        throw new Error(Reason.BadIterationCount);
      }
      this.#key_signatures = await deriveKeySignatures(this.#password, salt, iterCount);
      this.#auth_message += "," + challenge;
      this.#state = AuthenticationState.ServerChallenge;
    } catch (e) {
      this.#state = AuthenticationState.Failed;
      throw e;
    }
  }
  /**
   * Composes client-final-message
   */
  async composeResponse() {
    assert2(this.#state === AuthenticationState.ServerChallenge);
    assert2(this.#key_signatures);
    assert2(this.#server_nonce);
    try {
      const responseWithoutProof = `c=biws,r=${this.#server_nonce}`;
      this.#auth_message += "," + responseWithoutProof;
      const proof = base64_exports.encodeBase64(computeScramProof(await computeScramSignature(this.#auth_message, this.#key_signatures.stored), this.#key_signatures.client));
      const message = `${responseWithoutProof},p=${proof}`;
      this.#state = AuthenticationState.ClientResponse;
      return message;
    } catch (e) {
      this.#state = AuthenticationState.Failed;
      throw e;
    }
  }
  /**
   * Processes server-final-message
   */
  async receiveResponse(response) {
    assert2(this.#state === AuthenticationState.ClientResponse);
    assert2(this.#key_signatures);
    try {
      const attrs = parseScramAttributes(response);
      if (attrs.e) {
        throw new Error(attrs.e ?? Reason.Rejected);
      }
      const verifier = base64_exports.encodeBase64(await computeScramSignature(this.#auth_message, this.#key_signatures.server));
      if (attrs.v !== verifier) {
        throw new Error(Reason.BadVerifier);
      }
      this.#state = AuthenticationState.ServerResponse;
    } catch (e) {
      this.#state = AuthenticationState.Failed;
      throw e;
    }
  }
};

// deno:https://deno.land/x/postgres@v0.19.3/client/error.ts
var ConnectionError = class extends Error {
  /**
   * Create a new ConnectionError
   */
  constructor(message) {
    super(message);
    this.name = "ConnectionError";
  }
};
var ConnectionParamsError = class extends Error {
  /**
   * Create a new ConnectionParamsError
   */
  constructor(message, cause) {
    super(message, {
      cause
    });
    this.name = "ConnectionParamsError";
  }
};
var PostgresError = class extends Error {
  /**
   * The fields of the notice message
   */
  fields;
  /**
   * The query that caused the error
   */
  query;
  /**
   * Create a new PostgresError
   */
  constructor(fields, query) {
    super(fields.message);
    this.fields = fields;
    this.query = query;
    this.name = "PostgresError";
  }
};
var TransactionError = class extends Error {
  /**
   * Create a transaction error with a message and a cause
   */
  constructor(transaction_name, cause) {
    super(`The transaction "${transaction_name}" has been aborted`, {
      cause
    });
    this.name = "TransactionError";
  }
};

// deno:https://deno.land/x/postgres@v0.19.3/connection/message_code.ts
var ERROR_MESSAGE = "E";
var AUTHENTICATION_TYPE = {
  CLEAR_TEXT: 3,
  GSS_CONTINUE: 8,
  GSS_STARTUP: 7,
  MD5: 5,
  NO_AUTHENTICATION: 0,
  SASL_CONTINUE: 11,
  SASL_FINAL: 12,
  SASL_STARTUP: 10,
  SCM: 6,
  SSPI: 9
};
var INCOMING_AUTHENTICATION_MESSAGES = {
  AUTHENTICATION: "R",
  BACKEND_KEY: "K",
  PARAMETER_STATUS: "S",
  READY: "Z"
};
var INCOMING_TLS_MESSAGES = {
  ACCEPTS_TLS: "S",
  NO_ACCEPTS_TLS: "N"
};
var INCOMING_QUERY_MESSAGES = {
  BIND_COMPLETE: "2",
  COMMAND_COMPLETE: "C",
  DATA_ROW: "D",
  EMPTY_QUERY: "I",
  NOTICE_WARNING: "N",
  NO_DATA: "n",
  PARAMETER_STATUS: "S",
  PARSE_COMPLETE: "1",
  READY: "Z",
  ROW_DESCRIPTION: "T"
};

// deno:https://deno.land/x/postgres@v0.19.3/connection/auth.ts
var encoder2 = new TextEncoder();
async function md5(bytes) {
  return hex_exports.encodeHex(await stdCrypto.subtle.digest("MD5", bytes));
}
async function hashMd5Password(password, username, salt) {
  const innerHash = await md5(encoder2.encode(password + username));
  const innerBytes = encoder2.encode(innerHash);
  const outerBuffer = new Uint8Array(innerBytes.length + salt.length);
  outerBuffer.set(innerBytes);
  outerBuffer.set(salt, innerBytes.length);
  const outerHash = await md5(outerBuffer);
  return "md5" + outerHash;
}

// deno:https://deno.land/x/postgres@v0.19.3/debug.ts
var isDebugOptionEnabled = (option, options) => {
  if (typeof options === "boolean") {
    return options;
  }
  return !!options?.[option];
};

// deno:https://deno.land/x/postgres@v0.19.3/connection/connection.ts
function assertSuccessfulStartup(msg) {
  switch (msg.type) {
    case ERROR_MESSAGE:
      throw new PostgresError(parseNoticeMessage(msg));
  }
}
function assertSuccessfulAuthentication(auth_message) {
  if (auth_message.type === ERROR_MESSAGE) {
    throw new PostgresError(parseNoticeMessage(auth_message));
  }
  if (auth_message.type !== INCOMING_AUTHENTICATION_MESSAGES.AUTHENTICATION) {
    throw new Error(`Unexpected auth response: ${auth_message.type}.`);
  }
  const responseCode = auth_message.reader.readInt32();
  if (responseCode !== 0) {
    throw new Error(`Unexpected auth response code: ${responseCode}.`);
  }
}
function logNotice(notice) {
  if (notice.severity === "INFO") {
    console.info(`[ ${bold(rgb24(notice.severity, 16751103))} ] : ${notice.message}`);
  } else if (notice.severity === "NOTICE") {
    console.info(`[ ${bold(yellow(notice.severity))} ] : ${notice.message}`);
  } else if (notice.severity === "WARNING") {
    console.warn(`[ ${bold(rgb24(notice.severity, 16750848))} ] : ${notice.message}`);
  }
}
function logQuery(query) {
  console.info(`[ ${bold(rgb24("QUERY", 52479))} ] : ${query}`);
}
function logResults(rows) {
  console.info(`[ ${bold(rgb24("RESULTS", 52224))} ] :`, rows);
}
var decoder2 = new TextDecoder();
var encoder3 = new TextEncoder();
var Connection = class {
  #bufReader;
  #bufWriter;
  #conn;
  connected = false;
  #connection_params;
  #message_header = new Uint8Array(5);
  #onDisconnection;
  #packetWriter = new PacketWriter();
  #pid;
  #queryLock = new DeferredStack(1, [
    void 0
  ]);
  // TODO
  // Find out what the secret key is for
  #secretKey;
  #tls;
  #transport;
  get pid() {
    return this.#pid;
  }
  /** Indicates if the connection is carried over TLS */
  get tls() {
    return this.#tls;
  }
  /** Indicates the connection protocol used */
  get transport() {
    return this.#transport;
  }
  constructor(connection_params, disconnection_callback) {
    this.#connection_params = connection_params;
    this.#onDisconnection = disconnection_callback;
  }
  /**
   * Read single message sent by backend
   */
  async #readMessage() {
    this.#message_header.fill(0);
    await this.#bufReader.readFull(this.#message_header);
    const type = decoder2.decode(this.#message_header.slice(0, 1));
    if (type === "\0") {
      throw new ConnectionError("The session was terminated unexpectedly");
    }
    const length = readUInt32BE(this.#message_header, 1) - 4;
    const body = new Uint8Array(length);
    await this.#bufReader.readFull(body);
    return new Message(type, length, body);
  }
  async #serverAcceptsTLS() {
    const writer = this.#packetWriter;
    writer.clear();
    writer.addInt32(8).addInt32(80877103).join();
    await this.#bufWriter.write(writer.flush());
    await this.#bufWriter.flush();
    const response = new Uint8Array(1);
    await this.#conn.read(response);
    switch (String.fromCharCode(response[0])) {
      case INCOMING_TLS_MESSAGES.ACCEPTS_TLS:
        return true;
      case INCOMING_TLS_MESSAGES.NO_ACCEPTS_TLS:
        return false;
      default:
        throw new Error(`Could not check if server accepts SSL connections, server responded with: ${response}`);
    }
  }
  /** https://www.postgresql.org/docs/14/protocol-flow.html#id-1.10.5.7.3 */
  async #sendStartupMessage() {
    const writer = this.#packetWriter;
    writer.clear();
    writer.addInt16(3).addInt16(0);
    writer.addCString("client_encoding").addCString("'utf-8'");
    writer.addCString("user").addCString(this.#connection_params.user);
    writer.addCString("database").addCString(this.#connection_params.database);
    writer.addCString("application_name").addCString(this.#connection_params.applicationName);
    const connection_options = Object.entries(this.#connection_params.options);
    if (connection_options.length > 0) {
      writer.addCString("options").addCString(connection_options.map(([key, value]) => `--${key}=${value}`).join(" "));
    }
    writer.addCString("");
    const bodyBuffer = writer.flush();
    const bodyLength = bodyBuffer.length + 4;
    writer.clear();
    const finalBuffer = writer.addInt32(bodyLength).add(bodyBuffer).join();
    await this.#bufWriter.write(finalBuffer);
    await this.#bufWriter.flush();
    return await this.#readMessage();
  }
  async #openConnection(options) {
    this.#conn = await Deno.connect(options);
    this.#bufWriter = new BufWriter(this.#conn);
    this.#bufReader = new BufReader(this.#conn);
  }
  async #openSocketConnection(path, port) {
    if (Deno.build.os === "windows") {
      throw new Error("Socket connection is only available on UNIX systems");
    }
    const socket = await Deno.stat(path);
    if (socket.isFile) {
      await this.#openConnection({
        path,
        transport: "unix"
      });
    } else {
      const socket_guess = join3(path, getSocketName(port));
      try {
        await this.#openConnection({
          path: socket_guess,
          transport: "unix"
        });
      } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
          throw new ConnectionError(`Could not open socket in path "${socket_guess}"`);
        }
        throw e;
      }
    }
  }
  async #openTlsConnection(connection, options) {
    this.#conn = await Deno.startTls(connection, options);
    this.#bufWriter = new BufWriter(this.#conn);
    this.#bufReader = new BufReader(this.#conn);
  }
  #resetConnectionMetadata() {
    this.connected = false;
    this.#packetWriter = new PacketWriter();
    this.#pid = void 0;
    this.#queryLock = new DeferredStack(1, [
      void 0
    ]);
    this.#secretKey = void 0;
    this.#tls = void 0;
    this.#transport = void 0;
  }
  #closeConnection() {
    try {
      this.#conn.close();
    } catch (_e) {
    } finally {
      this.#resetConnectionMetadata();
    }
  }
  async #startup() {
    this.#closeConnection();
    const { host_type, hostname, port, tls: { caCertificates, enabled: tls_enabled, enforce: tls_enforced } } = this.#connection_params;
    if (host_type === "socket") {
      await this.#openSocketConnection(hostname, port);
      this.#tls = void 0;
      this.#transport = "socket";
    } else {
      await this.#openConnection({
        hostname,
        port,
        transport: "tcp"
      });
      this.#tls = false;
      this.#transport = "tcp";
      if (tls_enabled) {
        const accepts_tls = await this.#serverAcceptsTLS().catch((e) => {
          this.#closeConnection();
          throw e;
        });
        if (accepts_tls) {
          try {
            await this.#openTlsConnection(this.#conn, {
              hostname,
              caCerts: caCertificates
            });
            this.#tls = true;
          } catch (e) {
            if (!tls_enforced) {
              console.error(bold(yellow("TLS connection failed with message: ")) + e.message + "\n" + bold("Defaulting to non-encrypted connection"));
              await this.#openConnection({
                hostname,
                port,
                transport: "tcp"
              });
              this.#tls = false;
            } else {
              throw e;
            }
          }
        } else if (tls_enforced) {
          this.#closeConnection();
          throw new Error("The server isn't accepting TLS connections. Change the client configuration so TLS configuration isn't required to connect");
        }
      }
    }
    try {
      let startup_response;
      try {
        startup_response = await this.#sendStartupMessage();
      } catch (e) {
        this.#closeConnection();
        if (e instanceof Deno.errors.InvalidData && tls_enabled) {
          if (tls_enforced) {
            throw new Error("The certificate used to secure the TLS connection is invalid.");
          } else {
            console.error(bold(yellow("TLS connection failed with message: ")) + e.message + "\n" + bold("Defaulting to non-encrypted connection"));
            await this.#openConnection({
              hostname,
              port,
              transport: "tcp"
            });
            this.#tls = false;
            this.#transport = "tcp";
            startup_response = await this.#sendStartupMessage();
          }
        } else {
          throw e;
        }
      }
      assertSuccessfulStartup(startup_response);
      await this.#authenticate(startup_response);
      let message = await this.#readMessage();
      while (message.type !== INCOMING_AUTHENTICATION_MESSAGES.READY) {
        switch (message.type) {
          // Connection error (wrong database or user)
          case ERROR_MESSAGE:
            await this.#processErrorUnsafe(message, false);
            break;
          case INCOMING_AUTHENTICATION_MESSAGES.BACKEND_KEY: {
            const { pid, secret_key } = parseBackendKeyMessage(message);
            this.#pid = pid;
            this.#secretKey = secret_key;
            break;
          }
          case INCOMING_AUTHENTICATION_MESSAGES.PARAMETER_STATUS:
            break;
          default:
            throw new Error(`Unknown response for startup: ${message.type}`);
        }
        message = await this.#readMessage();
      }
      this.connected = true;
    } catch (e) {
      this.#closeConnection();
      throw e;
    }
  }
  /**
   * Calling startup on a connection twice will create a new session and overwrite the previous one
   *
   * @param is_reconnection This indicates whether the startup should behave as if there was
   * a connection previously established, or if it should attempt to create a connection first
   *
   * https://www.postgresql.org/docs/14/protocol-flow.html#id-1.10.5.7.3
   */
  async startup(is_reconnection) {
    if (is_reconnection && this.#connection_params.connection.attempts === 0) {
      throw new Error("The client has been disconnected from the database. Enable reconnection in the client to attempt reconnection after failure");
    }
    let reconnection_attempts = 0;
    const max_reconnections = this.#connection_params.connection.attempts;
    let error;
    if (!is_reconnection && this.#connection_params.connection.attempts === 0) {
      try {
        await this.#startup();
      } catch (e) {
        error = e;
      }
    } else {
      let interval = typeof this.#connection_params.connection.interval === "number" ? this.#connection_params.connection.interval : 0;
      while (reconnection_attempts < max_reconnections) {
        if (reconnection_attempts > 0) {
          if (typeof this.#connection_params.connection.interval === "function") {
            interval = this.#connection_params.connection.interval(interval);
          }
          if (interval > 0) {
            await delay(interval);
          }
        }
        try {
          await this.#startup();
          break;
        } catch (e) {
          reconnection_attempts++;
          if (reconnection_attempts === max_reconnections) {
            error = e;
          }
        }
      }
    }
    if (error) {
      await this.end();
      throw error;
    }
  }
  /**
   * Will attempt to authenticate with the database using the provided
   * password credentials
   */
  async #authenticate(authentication_request) {
    const authentication_type = authentication_request.reader.readInt32();
    let authentication_result;
    switch (authentication_type) {
      case AUTHENTICATION_TYPE.NO_AUTHENTICATION:
        authentication_result = authentication_request;
        break;
      case AUTHENTICATION_TYPE.CLEAR_TEXT:
        authentication_result = await this.#authenticateWithClearPassword();
        break;
      case AUTHENTICATION_TYPE.MD5: {
        const salt = authentication_request.reader.readBytes(4);
        authentication_result = await this.#authenticateWithMd5(salt);
        break;
      }
      case AUTHENTICATION_TYPE.SCM:
        throw new Error("Database server expected SCM authentication, which is not supported at the moment");
      case AUTHENTICATION_TYPE.GSS_STARTUP:
        throw new Error("Database server expected GSS authentication, which is not supported at the moment");
      case AUTHENTICATION_TYPE.GSS_CONTINUE:
        throw new Error("Database server expected GSS authentication, which is not supported at the moment");
      case AUTHENTICATION_TYPE.SSPI:
        throw new Error("Database server expected SSPI authentication, which is not supported at the moment");
      case AUTHENTICATION_TYPE.SASL_STARTUP:
        authentication_result = await this.#authenticateWithSasl();
        break;
      default:
        throw new Error(`Unknown auth message code ${authentication_type}`);
    }
    await assertSuccessfulAuthentication(authentication_result);
  }
  async #authenticateWithClearPassword() {
    this.#packetWriter.clear();
    const password = this.#connection_params.password || "";
    const buffer = this.#packetWriter.addCString(password).flush(112);
    await this.#bufWriter.write(buffer);
    await this.#bufWriter.flush();
    return this.#readMessage();
  }
  async #authenticateWithMd5(salt) {
    this.#packetWriter.clear();
    if (!this.#connection_params.password) {
      throw new ConnectionParamsError("Attempting MD5 authentication with unset password");
    }
    const password = await hashMd5Password(this.#connection_params.password, this.#connection_params.user, salt);
    const buffer = this.#packetWriter.addCString(password).flush(112);
    await this.#bufWriter.write(buffer);
    await this.#bufWriter.flush();
    return this.#readMessage();
  }
  /**
   * https://www.postgresql.org/docs/14/sasl-authentication.html
   */
  async #authenticateWithSasl() {
    if (!this.#connection_params.password) {
      throw new ConnectionParamsError("Attempting SASL auth with unset password");
    }
    const client = new Client(this.#connection_params.user, this.#connection_params.password);
    const utf8 = new TextDecoder("utf-8");
    const clientFirstMessage = client.composeChallenge();
    this.#packetWriter.clear();
    this.#packetWriter.addCString("SCRAM-SHA-256");
    this.#packetWriter.addInt32(clientFirstMessage.length);
    this.#packetWriter.addString(clientFirstMessage);
    this.#bufWriter.write(this.#packetWriter.flush(112));
    this.#bufWriter.flush();
    const maybe_sasl_continue = await this.#readMessage();
    switch (maybe_sasl_continue.type) {
      case INCOMING_AUTHENTICATION_MESSAGES.AUTHENTICATION: {
        const authentication_type = maybe_sasl_continue.reader.readInt32();
        if (authentication_type !== AUTHENTICATION_TYPE.SASL_CONTINUE) {
          throw new Error(`Unexpected authentication type in SASL negotiation: ${authentication_type}`);
        }
        break;
      }
      case ERROR_MESSAGE:
        throw new PostgresError(parseNoticeMessage(maybe_sasl_continue));
      default:
        throw new Error(`Unexpected message in SASL negotiation: ${maybe_sasl_continue.type}`);
    }
    const sasl_continue = utf8.decode(maybe_sasl_continue.reader.readAllBytes());
    await client.receiveChallenge(sasl_continue);
    this.#packetWriter.clear();
    this.#packetWriter.addString(await client.composeResponse());
    this.#bufWriter.write(this.#packetWriter.flush(112));
    this.#bufWriter.flush();
    const maybe_sasl_final = await this.#readMessage();
    switch (maybe_sasl_final.type) {
      case INCOMING_AUTHENTICATION_MESSAGES.AUTHENTICATION: {
        const authentication_type = maybe_sasl_final.reader.readInt32();
        if (authentication_type !== AUTHENTICATION_TYPE.SASL_FINAL) {
          throw new Error(`Unexpected authentication type in SASL finalization: ${authentication_type}`);
        }
        break;
      }
      case ERROR_MESSAGE:
        throw new PostgresError(parseNoticeMessage(maybe_sasl_final));
      default:
        throw new Error(`Unexpected message in SASL finalization: ${maybe_sasl_continue.type}`);
    }
    const sasl_final = utf8.decode(maybe_sasl_final.reader.readAllBytes());
    await client.receiveResponse(sasl_final);
    return this.#readMessage();
  }
  async #simpleQuery(query) {
    this.#packetWriter.clear();
    const buffer = this.#packetWriter.addCString(query.text).flush(81);
    await this.#bufWriter.write(buffer);
    await this.#bufWriter.flush();
    let result;
    if (query.result_type === ResultType.ARRAY) {
      result = new QueryArrayResult(query);
    } else {
      result = new QueryObjectResult(query);
    }
    let error;
    let current_message = await this.#readMessage();
    while (current_message.type !== INCOMING_QUERY_MESSAGES.READY) {
      switch (current_message.type) {
        case ERROR_MESSAGE:
          error = new PostgresError(parseNoticeMessage(current_message), isDebugOptionEnabled("queryInError", this.#connection_params.controls?.debug) ? query.text : void 0);
          break;
        case INCOMING_QUERY_MESSAGES.COMMAND_COMPLETE: {
          result.handleCommandComplete(parseCommandCompleteMessage(current_message));
          break;
        }
        case INCOMING_QUERY_MESSAGES.DATA_ROW: {
          const row_data = parseRowDataMessage(current_message);
          try {
            result.insertRow(row_data, this.#connection_params.controls);
          } catch (e) {
            error = e;
          }
          break;
        }
        case INCOMING_QUERY_MESSAGES.EMPTY_QUERY:
          break;
        case INCOMING_QUERY_MESSAGES.NOTICE_WARNING: {
          const notice = parseNoticeMessage(current_message);
          if (isDebugOptionEnabled("notices", this.#connection_params.controls?.debug)) {
            logNotice(notice);
          }
          result.warnings.push(notice);
          break;
        }
        case INCOMING_QUERY_MESSAGES.PARAMETER_STATUS:
          break;
        case INCOMING_QUERY_MESSAGES.READY:
          break;
        case INCOMING_QUERY_MESSAGES.ROW_DESCRIPTION: {
          result.loadColumnDescriptions(parseRowDescriptionMessage(current_message));
          break;
        }
        default:
          throw new Error(`Unexpected simple query message: ${current_message.type}`);
      }
      current_message = await this.#readMessage();
    }
    if (error) throw error;
    return result;
  }
  async #appendQueryToMessage(query) {
    this.#packetWriter.clear();
    const buffer = this.#packetWriter.addCString("").addCString(query.text).addInt16(0).flush(80);
    await this.#bufWriter.write(buffer);
  }
  async #appendArgumentsToMessage(query) {
    this.#packetWriter.clear();
    const hasBinaryArgs = query.args.some((arg) => arg instanceof Uint8Array);
    this.#packetWriter.clear();
    this.#packetWriter.addCString("").addCString("");
    if (hasBinaryArgs) {
      this.#packetWriter.addInt16(query.args.length);
      query.args.forEach((arg) => {
        this.#packetWriter.addInt16(arg instanceof Uint8Array ? 1 : 0);
      });
    } else {
      this.#packetWriter.addInt16(0);
    }
    this.#packetWriter.addInt16(query.args.length);
    query.args.forEach((arg) => {
      if (arg === null || typeof arg === "undefined") {
        this.#packetWriter.addInt32(-1);
      } else if (arg instanceof Uint8Array) {
        this.#packetWriter.addInt32(arg.length);
        this.#packetWriter.add(arg);
      } else {
        const byteLength = encoder3.encode(arg).length;
        this.#packetWriter.addInt32(byteLength);
        this.#packetWriter.addString(arg);
      }
    });
    this.#packetWriter.addInt16(0);
    const buffer = this.#packetWriter.flush(66);
    await this.#bufWriter.write(buffer);
  }
  /**
   * This function appends the query type (in this case prepared statement)
   * to the message
   */
  async #appendDescribeToMessage() {
    this.#packetWriter.clear();
    const buffer = this.#packetWriter.addCString("P").flush(68);
    await this.#bufWriter.write(buffer);
  }
  async #appendExecuteToMessage() {
    this.#packetWriter.clear();
    const buffer = this.#packetWriter.addCString("").addInt32(0).flush(69);
    await this.#bufWriter.write(buffer);
  }
  async #appendSyncToMessage() {
    this.#packetWriter.clear();
    const buffer = this.#packetWriter.flush(83);
    await this.#bufWriter.write(buffer);
  }
  // TODO
  // Rename process function to a more meaningful name and move out of class
  async #processErrorUnsafe(msg, recoverable = true) {
    const error = new PostgresError(parseNoticeMessage(msg));
    if (recoverable) {
      let maybe_ready_message = await this.#readMessage();
      while (maybe_ready_message.type !== INCOMING_QUERY_MESSAGES.READY) {
        maybe_ready_message = await this.#readMessage();
      }
    }
    throw error;
  }
  async #preparedQuery(query) {
    await this.#appendQueryToMessage(query);
    await this.#appendArgumentsToMessage(query);
    await this.#appendDescribeToMessage();
    await this.#appendExecuteToMessage();
    await this.#appendSyncToMessage();
    await this.#bufWriter.flush();
    let result;
    if (query.result_type === ResultType.ARRAY) {
      result = new QueryArrayResult(query);
    } else {
      result = new QueryObjectResult(query);
    }
    let error;
    let current_message = await this.#readMessage();
    while (current_message.type !== INCOMING_QUERY_MESSAGES.READY) {
      switch (current_message.type) {
        case ERROR_MESSAGE: {
          error = new PostgresError(parseNoticeMessage(current_message), isDebugOptionEnabled("queryInError", this.#connection_params.controls?.debug) ? query.text : void 0);
          break;
        }
        case INCOMING_QUERY_MESSAGES.BIND_COMPLETE:
          break;
        case INCOMING_QUERY_MESSAGES.COMMAND_COMPLETE: {
          result.handleCommandComplete(parseCommandCompleteMessage(current_message));
          break;
        }
        case INCOMING_QUERY_MESSAGES.DATA_ROW: {
          const row_data = parseRowDataMessage(current_message);
          try {
            result.insertRow(row_data, this.#connection_params.controls);
          } catch (e) {
            error = e;
          }
          break;
        }
        case INCOMING_QUERY_MESSAGES.NO_DATA:
          break;
        case INCOMING_QUERY_MESSAGES.NOTICE_WARNING: {
          const notice = parseNoticeMessage(current_message);
          if (isDebugOptionEnabled("notices", this.#connection_params.controls?.debug)) {
            logNotice(notice);
          }
          result.warnings.push(notice);
          break;
        }
        case INCOMING_QUERY_MESSAGES.PARAMETER_STATUS:
          break;
        case INCOMING_QUERY_MESSAGES.PARSE_COMPLETE:
          break;
        case INCOMING_QUERY_MESSAGES.ROW_DESCRIPTION: {
          result.loadColumnDescriptions(parseRowDescriptionMessage(current_message));
          break;
        }
        default:
          throw new Error(`Unexpected prepared query message: ${current_message.type}`);
      }
      current_message = await this.#readMessage();
    }
    if (error) throw error;
    return result;
  }
  async query(query) {
    if (!this.connected) {
      await this.startup(true);
    }
    await this.#queryLock.pop();
    try {
      if (isDebugOptionEnabled("queries", this.#connection_params.controls?.debug)) {
        logQuery(query.text);
      }
      let result;
      if (query.args.length === 0) {
        result = await this.#simpleQuery(query);
      } else {
        result = await this.#preparedQuery(query);
      }
      if (isDebugOptionEnabled("results", this.#connection_params.controls?.debug)) {
        logResults(result.rows);
      }
      return result;
    } catch (e) {
      if (e instanceof ConnectionError) {
        await this.end();
      }
      throw e;
    } finally {
      this.#queryLock.push(void 0);
    }
  }
  async end() {
    if (this.connected) {
      const terminationMessage = new Uint8Array([
        88,
        0,
        0,
        0,
        4
      ]);
      await this.#bufWriter.write(terminationMessage);
      try {
        await this.#bufWriter.flush();
      } catch (_e) {
      } finally {
        this.#closeConnection();
        this.#onDisconnection();
      }
    }
  }
};

// deno:https://deno.land/x/postgres@v0.19.3/connection/connection_params.ts
function getPgEnv() {
  return {
    applicationName: Deno.env.get("PGAPPNAME"),
    database: Deno.env.get("PGDATABASE"),
    hostname: Deno.env.get("PGHOST"),
    options: Deno.env.get("PGOPTIONS"),
    password: Deno.env.get("PGPASSWORD"),
    port: Deno.env.get("PGPORT"),
    user: Deno.env.get("PGUSER")
  };
}
function formatMissingParams(missingParams) {
  return `Missing connection parameters: ${missingParams.join(", ")}`;
}
function assertRequiredOptions(options, requiredKeys, has_env_access) {
  const missingParams = [];
  for (const key of requiredKeys) {
    if (options[key] === "" || options[key] === null || options[key] === void 0) {
      missingParams.push(key);
    }
  }
  if (missingParams.length) {
    let missing_params_message = formatMissingParams(missingParams);
    if (!has_env_access) {
      missing_params_message += "\nConnection parameters can be read from environment variables only if Deno is run with env permission";
    }
    throw new ConnectionParamsError(missing_params_message);
  }
}
function parseOptionsArgument(options) {
  const args = options.split(" ");
  const transformed_args = [];
  for (let x = 0; x < args.length; x++) {
    if (/^-\w/.test(args[x])) {
      if (args[x] === "-c") {
        if (args[x + 1] === void 0) {
          throw new Error(`No provided value for "${args[x]}" in options parameter`);
        }
        transformed_args.push(args[x + 1]);
        x++;
      } else {
        throw new Error(`Argument "${args[x]}" is not supported in options parameter`);
      }
    } else if (/^--\w/.test(args[x])) {
      transformed_args.push(args[x].slice(2));
    } else {
      throw new Error(`Value "${args[x]}" is not a valid options argument`);
    }
  }
  return transformed_args.reduce((options2, x) => {
    if (!/.+=.+/.test(x)) {
      throw new Error(`Value "${x}" is not a valid options argument`);
    }
    const key = x.slice(0, x.indexOf("="));
    const value = x.slice(x.indexOf("=") + 1);
    options2[key] = value;
    return options2;
  }, {});
}
function parseOptionsFromUri(connection_string) {
  let postgres_uri;
  try {
    const uri = parseConnectionUri(connection_string);
    postgres_uri = {
      application_name: uri.params.application_name,
      dbname: uri.path || uri.params.dbname,
      driver: uri.driver,
      host: uri.host || uri.params.host,
      options: uri.params.options,
      password: uri.password || uri.params.password,
      port: uri.port || uri.params.port,
      // Compatibility with JDBC, not standard
      // Treat as sslmode=require
      sslmode: uri.params.ssl === "true" ? "require" : uri.params.sslmode,
      user: uri.user || uri.params.user
    };
  } catch (e) {
    throw new ConnectionParamsError("Could not parse the connection string", e);
  }
  if (![
    "postgres",
    "postgresql"
  ].includes(postgres_uri.driver)) {
    throw new ConnectionParamsError(`Supplied DSN has invalid driver: ${postgres_uri.driver}.`);
  }
  const host_type = postgres_uri.host ? isAbsolute3(postgres_uri.host) ? "socket" : "tcp" : "socket";
  const options = postgres_uri.options ? parseOptionsArgument(postgres_uri.options) : {};
  let tls;
  switch (postgres_uri.sslmode) {
    case void 0: {
      break;
    }
    case "disable": {
      tls = {
        enabled: false,
        enforce: false,
        caCertificates: []
      };
      break;
    }
    case "prefer": {
      tls = {
        enabled: true,
        enforce: false,
        caCertificates: []
      };
      break;
    }
    case "require":
    case "verify-ca":
    case "verify-full": {
      tls = {
        enabled: true,
        enforce: true,
        caCertificates: []
      };
      break;
    }
    default: {
      throw new ConnectionParamsError(`Supplied DSN has invalid sslmode '${postgres_uri.sslmode}'`);
    }
  }
  return {
    applicationName: postgres_uri.application_name,
    database: postgres_uri.dbname,
    hostname: postgres_uri.host,
    host_type,
    options,
    password: postgres_uri.password,
    port: postgres_uri.port,
    tls,
    user: postgres_uri.user
  };
}
var DEFAULT_OPTIONS = {
  applicationName: "deno_postgres",
  connection: {
    attempts: 1,
    interval: (previous_interval) => previous_interval + 500
  },
  host: "127.0.0.1",
  socket: "/tmp",
  host_type: "socket",
  options: {},
  port: 5432,
  tls: {
    enabled: true,
    enforce: false,
    caCertificates: []
  }
};
function createParams(params = {}) {
  if (typeof params === "string") {
    params = parseOptionsFromUri(params);
  }
  let pgEnv = {};
  let has_env_access = true;
  try {
    pgEnv = getPgEnv();
  } catch (e) {
    if (e instanceof Deno.errors.PermissionDenied) {
      has_env_access = false;
    } else {
      throw e;
    }
  }
  const provided_host = params.hostname ?? pgEnv.hostname;
  const host_type = params.host_type ?? (provided_host ? "tcp" : DEFAULT_OPTIONS.host_type);
  if (![
    "tcp",
    "socket"
  ].includes(host_type)) {
    throw new ConnectionParamsError(`"${host_type}" is not a valid host type`);
  }
  let host;
  if (host_type === "socket") {
    const socket = provided_host ?? DEFAULT_OPTIONS.socket;
    try {
      if (!isAbsolute3(socket)) {
        const parsed_host = new URL(socket, Deno.mainModule);
        if (parsed_host.protocol === "file:") {
          host = fromFileUrl3(parsed_host);
        } else {
          throw new Error("The provided host is not a file path");
        }
      } else {
        host = socket;
      }
    } catch (e) {
      throw new ConnectionParamsError(`Could not parse host "${socket}"`, e);
    }
  } else {
    host = provided_host ?? DEFAULT_OPTIONS.host;
  }
  const provided_options = params.options ?? pgEnv.options;
  let options;
  if (provided_options) {
    if (typeof provided_options === "string") {
      options = parseOptionsArgument(provided_options);
    } else {
      options = provided_options;
    }
  } else {
    options = {};
  }
  for (const key in options) {
    if (!/^\w+$/.test(key)) {
      throw new Error(`The "${key}" key in the options argument is invalid`);
    }
    options[key] = options[key].replaceAll(" ", "\\ ");
  }
  let port;
  if (params.port) {
    port = Number(params.port);
  } else if (pgEnv.port) {
    port = Number(pgEnv.port);
  } else {
    port = Number(DEFAULT_OPTIONS.port);
  }
  if (Number.isNaN(port) || port === 0) {
    throw new ConnectionParamsError(`"${params.port ?? pgEnv.port}" is not a valid port number`);
  }
  if (host_type === "socket" && params?.tls) {
    throw new ConnectionParamsError('No TLS options are allowed when host type is set to "socket"');
  }
  const tls_enabled = !!(params?.tls?.enabled ?? DEFAULT_OPTIONS.tls.enabled);
  const tls_enforced = !!(params?.tls?.enforce ?? DEFAULT_OPTIONS.tls.enforce);
  if (!tls_enabled && tls_enforced) {
    throw new ConnectionParamsError("Can't enforce TLS when client has TLS encryption is disabled");
  }
  const connection_options = {
    applicationName: params.applicationName ?? pgEnv.applicationName ?? DEFAULT_OPTIONS.applicationName,
    connection: {
      attempts: params?.connection?.attempts ?? DEFAULT_OPTIONS.connection.attempts,
      interval: params?.connection?.interval ?? DEFAULT_OPTIONS.connection.interval
    },
    database: params.database ?? pgEnv.database,
    hostname: host,
    host_type,
    options,
    password: params.password ?? pgEnv.password,
    port,
    tls: {
      enabled: tls_enabled,
      enforce: tls_enforced,
      caCertificates: params?.tls?.caCertificates ?? []
    },
    user: params.user ?? pgEnv.user,
    controls: params.controls
  };
  assertRequiredOptions(connection_options, [
    "applicationName",
    "database",
    "hostname",
    "host_type",
    "port",
    "user"
  ], has_env_access);
  return connection_options;
}

// deno:https://deno.land/x/postgres@v0.19.3/query/transaction.ts
var Savepoint = class {
  name;
  /**
   * This is the count of the current savepoint instances in the transaction
   */
  #instance_count;
  #release_callback;
  #update_callback;
  /**
   * Create a new savepoint with the provided name and callbacks
   */
  constructor(name, update_callback, release_callback) {
    this.name = name;
    this.#instance_count = 0;
    this.#release_callback = release_callback;
    this.#update_callback = update_callback;
  }
  /**
   * This is the count of the current savepoint instances in the transaction
   */
  get instances() {
    return this.#instance_count;
  }
  /**
   * Releasing a savepoint will remove it's last instance in the transaction
   *
   * ```ts
   * import { Client } from "https://deno.land/x/postgres/mod.ts";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * const savepoint = await transaction.savepoint("n1");
   * await savepoint.release();
   * transaction.rollback(savepoint); // Error, can't rollback because the savepoint was released
   * ```
   *
   * It will also allow you to set the savepoint to the position it had before the last update
   *
   * ```ts
   * import { Client } from "https://deno.land/x/postgres/mod.ts";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * const savepoint = await transaction.savepoint("n1");
   * await savepoint.update();
   * await savepoint.release(); // This drops the update of the last statement
   * transaction.rollback(savepoint); // Will rollback to the first instance of the savepoint
   * ```
   *
   * This function will throw if there are no savepoint instances to drop
   */
  async release() {
    if (this.#instance_count === 0) {
      throw new Error("This savepoint has no instances to release");
    }
    await this.#release_callback(this.name);
    --this.#instance_count;
  }
  /**
   * Updating a savepoint will update its position in the transaction execution
   *
   * ```ts
   * import { Client } from "https://deno.land/x/postgres/mod.ts";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * const my_value = "some value";
   *
   * const savepoint = await transaction.savepoint("n1");
   * transaction.queryArray`INSERT INTO MY_TABLE (X) VALUES (${my_value})`;
   * await savepoint.update(); // Rolling back will now return you to this point on the transaction
   * ```
   *
   * You can also undo a savepoint update by using the `release` method
   *
   * ```ts
   * import { Client } from "https://deno.land/x/postgres/mod.ts";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * const savepoint = await transaction.savepoint("n1");
   * transaction.queryArray`DELETE FROM VERY_IMPORTANT_TABLE`;
   * await savepoint.update(); // Oops, shouldn't have updated the savepoint
   * await savepoint.release(); // This will undo the last update and return the savepoint to the first instance
   * await transaction.rollback(); // Will rollback before the table was deleted
   * ```
   */
  async update() {
    await this.#update_callback(this.name);
    ++this.#instance_count;
  }
};
var Transaction = class {
  name;
  #client;
  #executeQuery;
  /** The isolation level of the transaction */
  #isolation_level;
  #read_only;
  /** The transaction savepoints */
  #savepoints;
  #snapshot;
  #updateClientLock;
  /**
   * Create a new transaction with the provided name and options
   */
  constructor(name, options, client, execute_query_callback, update_client_lock_callback) {
    this.name = name;
    this.#savepoints = [];
    this.#committed = false;
    this.#client = client;
    this.#executeQuery = execute_query_callback;
    this.#isolation_level = options?.isolation_level ?? "read_committed";
    this.#read_only = options?.read_only ?? false;
    this.#snapshot = options?.snapshot;
    this.#updateClientLock = update_client_lock_callback;
  }
  /**
   * Get the isolation level of the transaction
   */
  get isolation_level() {
    return this.#isolation_level;
  }
  /**
   * Get all the savepoints of the transaction
   */
  get savepoints() {
    return this.#savepoints;
  }
  /**
   * This method will throw if the transaction opened in the client doesn't match this one
   */
  #assertTransactionOpen() {
    if (this.#client.session.current_transaction !== this.name) {
      throw new Error('This transaction has not been started yet, make sure to use the "begin" method to do so');
    }
  }
  #resetTransaction() {
    this.#savepoints = [];
  }
  /**
   * The begin method will officially begin the transaction, and it must be called before
   * any query or transaction operation is executed in order to lock the session
   * ```ts
   * import { Client } from "https://deno.land/x/postgres/mod.ts";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction_name");
   *
   * await transaction.begin(); // Session is locked, transaction operations are now safe
   * // Important operations
   * await transaction.commit(); // Session is unlocked, external operations can now take place
   * ```
   * https://www.postgresql.org/docs/14/sql-begin.html
   */
  async begin() {
    if (this.#client.session.current_transaction !== null) {
      if (this.#client.session.current_transaction === this.name) {
        throw new Error("This transaction is already open");
      }
      throw new Error(`This client already has an ongoing transaction "${this.#client.session.current_transaction}"`);
    }
    let isolation_level;
    switch (this.#isolation_level) {
      case "read_committed": {
        isolation_level = "READ COMMITTED";
        break;
      }
      case "repeatable_read": {
        isolation_level = "REPEATABLE READ";
        break;
      }
      case "serializable": {
        isolation_level = "SERIALIZABLE";
        break;
      }
      default:
        throw new Error(`Unexpected isolation level "${this.#isolation_level}"`);
    }
    let permissions;
    if (this.#read_only) {
      permissions = "READ ONLY";
    } else {
      permissions = "READ WRITE";
    }
    let snapshot = "";
    if (this.#snapshot) {
      snapshot = `SET TRANSACTION SNAPSHOT '${this.#snapshot}'`;
    }
    try {
      await this.#client.queryArray(`BEGIN ${permissions} ISOLATION LEVEL ${isolation_level};${snapshot}`);
    } catch (e) {
      if (e instanceof PostgresError) {
        throw new TransactionError(this.name, e);
      } else {
        throw e;
      }
    }
    this.#updateClientLock(this.name);
  }
  #committed;
  /**
   * The commit method will make permanent all changes made to the database in the
   * current transaction and end the current transaction
   *
   * ```ts
   * import { Client } from "https://deno.land/x/postgres/mod.ts";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * await transaction.begin();
   * // Important operations
   * await transaction.commit(); // Will terminate the transaction and save all changes
   * ```
   *
   * The commit method allows you to specify a "chain" option, that allows you to both commit the current changes and
   * start a new with the same transaction parameters in a single statement
   *
   * ```ts
   * import { Client } from "https://deno.land/x/postgres/mod.ts";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * // Transaction operations I want to commit
   * await transaction.commit({ chain: true }); // All changes are saved, following statements will be executed inside a transaction
   * await transaction.queryArray`DELETE SOMETHING FROM SOMEWHERE`; // Still inside the transaction
   * await transaction.commit(); // The transaction finishes for good
   * ```
   *
   * https://www.postgresql.org/docs/14/sql-commit.html
   */
  async commit(options) {
    this.#assertTransactionOpen();
    const chain = options?.chain ?? false;
    if (!this.#committed) {
      try {
        await this.queryArray(`COMMIT ${chain ? "AND CHAIN" : ""}`);
        if (!chain) {
          this.#committed = true;
        }
      } catch (e) {
        if (e instanceof PostgresError) {
          throw new TransactionError(this.name, e);
        } else {
          throw e;
        }
      }
    }
    this.#resetTransaction();
    if (!chain) {
      this.#updateClientLock(null);
    }
  }
  /**
   * This method will search for the provided savepoint name and return a
   * reference to the requested savepoint, otherwise it will return undefined
   */
  getSavepoint(name) {
    return this.#savepoints.find((sv) => sv.name === name.toLowerCase());
  }
  /**
   * This method will list you all of the active savepoints in this transaction
   */
  getSavepoints() {
    return this.#savepoints.filter(({ instances }) => instances > 0).map(({ name }) => name);
  }
  /**
   * This method returns the snapshot id of the on going transaction, allowing you to share
   * the snapshot state between two transactions
   *
   * ```ts
   * import { Client } from "https://deno.land/x/postgres/mod.ts";
   * const client_1 = new Client();
   * const client_2 = new Client();
   * const transaction_1 = client_1.createTransaction("transaction");
   *
   * const snapshot = await transaction_1.getSnapshot();
   * const transaction_2 = client_2.createTransaction("new_transaction", { isolation_level: "repeatable_read", snapshot });
   * // transaction_2 now shares the same starting state that transaction_1 had
   * ```
   * https://www.postgresql.org/docs/14/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION
   */
  async getSnapshot() {
    this.#assertTransactionOpen();
    const { rows } = await this.queryObject`SELECT PG_EXPORT_SNAPSHOT() AS SNAPSHOT;`;
    return rows[0].snapshot;
  }
  async queryArray(query_template_or_config, ...args) {
    this.#assertTransactionOpen();
    let query;
    if (typeof query_template_or_config === "string") {
      query = new Query(query_template_or_config, ResultType.ARRAY, args[0]);
    } else if (isTemplateString(query_template_or_config)) {
      query = templateStringToQuery(query_template_or_config, args, ResultType.ARRAY);
    } else {
      query = new Query(query_template_or_config, ResultType.ARRAY);
    }
    try {
      return await this.#executeQuery(query);
    } catch (e) {
      if (e instanceof PostgresError) {
        await this.commit();
        throw new TransactionError(this.name, e);
      } else {
        throw e;
      }
    }
  }
  async queryObject(query_template_or_config, ...args) {
    this.#assertTransactionOpen();
    let query;
    if (typeof query_template_or_config === "string") {
      query = new Query(query_template_or_config, ResultType.OBJECT, args[0]);
    } else if (isTemplateString(query_template_or_config)) {
      query = templateStringToQuery(query_template_or_config, args, ResultType.OBJECT);
    } else {
      query = new Query(query_template_or_config, ResultType.OBJECT);
    }
    try {
      return await this.#executeQuery(query);
    } catch (e) {
      if (e instanceof PostgresError) {
        await this.commit();
        throw new TransactionError(this.name, e);
      } else {
        throw e;
      }
    }
  }
  async rollback(savepoint_or_options) {
    this.#assertTransactionOpen();
    let savepoint_option;
    if (typeof savepoint_or_options === "string" || savepoint_or_options instanceof Savepoint) {
      savepoint_option = savepoint_or_options;
    } else {
      savepoint_option = savepoint_or_options?.savepoint;
    }
    let savepoint_name;
    if (savepoint_option instanceof Savepoint) {
      savepoint_name = savepoint_option.name;
    } else if (typeof savepoint_option === "string") {
      savepoint_name = savepoint_option.toLowerCase();
    }
    let chain_option = false;
    if (typeof savepoint_or_options === "object") {
      chain_option = savepoint_or_options?.chain ?? false;
    }
    if (chain_option && savepoint_name) {
      throw new Error("The chain option can't be used alongside a savepoint on a rollback operation");
    }
    if (typeof savepoint_option !== "undefined") {
      const ts_savepoint = this.#savepoints.find(({ name }) => name === savepoint_name);
      if (!ts_savepoint) {
        throw new Error(`There is no "${savepoint_name}" savepoint registered in this transaction`);
      }
      if (!ts_savepoint.instances) {
        throw new Error(`There are no savepoints of "${savepoint_name}" left to rollback to`);
      }
      await this.queryArray(`ROLLBACK TO ${savepoint_name}`);
      return;
    }
    try {
      await this.queryArray(`ROLLBACK ${chain_option ? "AND CHAIN" : ""}`);
    } catch (e) {
      if (e instanceof PostgresError) {
        await this.commit();
        throw new TransactionError(this.name, e);
      } else {
        throw e;
      }
    }
    this.#resetTransaction();
    if (!chain_option) {
      this.#updateClientLock(null);
    }
  }
  /**
   * This method will generate a savepoint, which will allow you to reset transaction states
   * to a previous point of time
   *
   * Each savepoint has a unique name used to identify it, and it must abide the following rules
   *
   * - Savepoint names must start with a letter or an underscore
   * - Savepoint names are case insensitive
   * - Savepoint names can't be longer than 63 characters
   * - Savepoint names can only have alphanumeric characters
   *
   * A savepoint can be easily created like this
   * ```ts
   * import { Client } from "https://deno.land/x/postgres/mod.ts";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * const savepoint = await transaction.savepoint("MY_savepoint"); // returns a `Savepoint` with name "my_savepoint"
   * await transaction.rollback(savepoint);
   * await savepoint.release(); // The savepoint will be removed
   * ```
   * All savepoints can have multiple positions in a transaction, and you can change or update
   * this positions by using the `update` and `release` methods
   * ```ts
   * import { Client } from "https://deno.land/x/postgres/mod.ts";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * const savepoint = await transaction.savepoint("n1");
   * await transaction.queryArray`INSERT INTO MY_TABLE VALUES (${'A'}, ${2})`;
   * await savepoint.update(); // The savepoint will continue from here
   * await transaction.queryArray`DELETE FROM MY_TABLE`;
   * await transaction.rollback(savepoint); // The transaction will rollback before the delete, but after the insert
   * await savepoint.release(); // The last savepoint will be removed, the original one will remain
   * await transaction.rollback(savepoint); // It rolls back before the insert
   * await savepoint.release(); // All savepoints are released
   * ```
   *
   * Creating a new savepoint with an already used name will return you a reference to
   * the original savepoint
   * ```ts
   * import { Client } from "https://deno.land/x/postgres/mod.ts";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * const savepoint_a = await transaction.savepoint("a");
   * await transaction.queryArray`DELETE FROM MY_TABLE`;
   * const savepoint_b = await transaction.savepoint("a"); // They will be the same savepoint, but the savepoint will be updated to this position
   * await transaction.rollback(savepoint_a); // Rolls back to savepoint_b
   * ```
   * https://www.postgresql.org/docs/14/sql-savepoint.html
   */
  async savepoint(name) {
    this.#assertTransactionOpen();
    if (!/^[a-zA-Z_]{1}[\w]{0,62}$/.test(name)) {
      if (!Number.isNaN(Number(name[0]))) {
        throw new Error("The savepoint name can't begin with a number");
      }
      if (name.length > 63) {
        throw new Error("The savepoint name can't be longer than 63 characters");
      }
      throw new Error("The savepoint name can only contain alphanumeric characters");
    }
    name = name.toLowerCase();
    let savepoint = this.#savepoints.find((sv) => sv.name === name);
    if (savepoint) {
      try {
        await savepoint.update();
      } catch (e) {
        if (e instanceof PostgresError) {
          await this.commit();
          throw new TransactionError(this.name, e);
        } else {
          throw e;
        }
      }
    } else {
      savepoint = new Savepoint(name, async (name2) => {
        await this.queryArray(`SAVEPOINT ${name2}`);
      }, async (name2) => {
        await this.queryArray(`RELEASE SAVEPOINT ${name2}`);
      });
      try {
        await savepoint.update();
      } catch (e) {
        if (e instanceof PostgresError) {
          await this.commit();
          throw new TransactionError(this.name, e);
        } else {
          throw e;
        }
      }
      this.#savepoints.push(savepoint);
    }
    return savepoint;
  }
};

// deno:https://deno.land/x/postgres@v0.19.3/client.ts
var _computedKey;
var QueryClient = class {
  #connection;
  #terminated = false;
  #transaction = null;
  /**
   * Create a new query client
   */
  constructor(connection) {
    this.#connection = connection;
  }
  /**
   * Indicates if the client is currently connected to the database
   */
  get connected() {
    return this.#connection.connected;
  }
  /**
   * The current session metadata
   */
  get session() {
    return {
      current_transaction: this.#transaction,
      pid: this.#connection.pid,
      tls: this.#connection.tls,
      transport: this.#connection.transport
    };
  }
  #assertOpenConnection() {
    if (this.#terminated) {
      throw new Error("Connection to the database has been terminated");
    }
  }
  /**
   * Close the connection to the database
   */
  async closeConnection() {
    if (this.connected) {
      await this.#connection.end();
    }
    this.resetSessionMetadata();
  }
  /**
   * Transactions are a powerful feature that guarantees safe operations by allowing you to control
   * the outcome of a series of statements and undo, reset, and step back said operations to
   * your liking
   *
   * In order to create a transaction, use the `createTransaction` method in your client as follows:
   *
   * ```ts
   * import { Client } from "https://deno.land/x/postgres/mod.ts";
   * const client = new Client();
   * const transaction = client.createTransaction("my_transaction_name");
   *
   * await transaction.begin();
   * // All statements between begin and commit will happen inside the transaction
   * await transaction.commit(); // All changes are saved
   * ```
   *
   * All statements that fail in query execution will cause the current transaction to abort and release
   * the client without applying any of the changes that took place inside it
   *
   * ```ts
   * import { Client } from "https://deno.land/x/postgres/mod.ts";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * await transaction.begin();
   * await transaction.queryArray`INSERT INTO MY_TABLE (X) VALUES ${"some_value"}`;
   * try {
   *   await transaction.queryArray`SELECT []`; // Invalid syntax, transaction aborted, changes won't be applied
   * }catch(e){
   *   await transaction.commit(); // Will throw, current transaction has already finished
   * }
   * ```
   *
   * This however, only happens if the error is of execution in nature, validation errors won't abort
   * the transaction
   *
   * ```ts
   * import { Client } from "https://deno.land/x/postgres/mod.ts";
   * const client = new Client();
   * const transaction = client.createTransaction("transaction");
   *
   * await transaction.begin();
   * await transaction.queryArray`INSERT INTO MY_TABLE (X) VALUES ${"some_value"}`;
   * try {
   *   await transaction.rollback("unexistent_savepoint"); // Validation error
   * } catch(e) {
   *   await transaction.commit(); // Transaction will end, changes will be saved
   * }
   * ```
   *
   * A transaction has many options to ensure modifications made to the database are safe and
   * have the expected outcome, which is a hard thing to accomplish in a database with many concurrent users,
   * and it does so by allowing you to set local levels of isolation to the transaction you are about to begin
   *
   * Each transaction can execute with the following levels of isolation:
   *
   * - Read committed: This is the normal behavior of a transaction. External changes to the database
   *   will be visible inside the transaction once they are committed.
   *
   * - Repeatable read: This isolates the transaction in a way that any external changes to the data we are reading
   *   won't be visible inside the transaction until it has finished
   *   ```ts
   *   import { Client } from "https://deno.land/x/postgres/mod.ts";
   *   const client = new Client();
   *   const transaction = await client.createTransaction("my_transaction", { isolation_level: "repeatable_read" });
   *   ```
   *
   * - Serializable: This isolation level prevents the current transaction from making persistent changes
   *   if the data they were reading at the beginning of the transaction has been modified (recommended)
   *   ```ts
   *   import { Client } from "https://deno.land/x/postgres/mod.ts";
   *   const client = new Client();
   *   const transaction = await client.createTransaction("my_transaction", { isolation_level: "serializable" });
   *   ```
   *
   * Additionally, each transaction allows you to set two levels of access to the data:
   *
   * - Read write: This is the default mode, it allows you to execute all commands you have access to normally
   *
   * - Read only: Disables all commands that can make changes to the database. Main use for the read only mode
   *   is to in conjuction with the repeatable read isolation, ensuring the data you are reading does not change
   *   during the transaction, specially useful for data extraction
   *   ```ts
   *   import { Client } from "https://deno.land/x/postgres/mod.ts";
   *   const client = new Client();
   *   const transaction = await client.createTransaction("my_transaction", { read_only: true });
   *   ```
   *
   * Last but not least, transactions allow you to share starting point snapshots between them.
   * For example, if you initialized a repeatable read transaction before a particularly sensible change
   * in the database, and you would like to start several transactions with that same before the change state
   * you can do the following:
   *
   * ```ts
   * import { Client } from "https://deno.land/x/postgres/mod.ts";
   * const client_1 = new Client();
   * const client_2 = new Client();
   * const transaction_1 = client_1.createTransaction("transaction_1");
   *
   * const snapshot = await transaction_1.getSnapshot();
   * const transaction_2 = client_2.createTransaction("new_transaction", { isolation_level: "repeatable_read", snapshot });
   * // transaction_2 now shares the same starting state that transaction_1 had
   * ```
   *
   * https://www.postgresql.org/docs/14/tutorial-transactions.html
   * https://www.postgresql.org/docs/14/sql-set-transaction.html
   */
  createTransaction(name, options) {
    if (!name) {
      throw new Error("Transaction name must be a non-empty string");
    }
    this.#assertOpenConnection();
    return new Transaction(name, options, this, this.#executeQuery.bind(this), (name2) => {
      this.#transaction = name2;
    });
  }
  /**
   * Every client must initialize their connection previously to the
   * execution of any statement
   */
  async connect() {
    if (!this.connected) {
      await this.#connection.startup(false);
      this.#terminated = false;
    }
  }
  /**
   * Closing your PostgreSQL connection will delete all non-persistent data
   * that may have been created in the course of the session and will require
   * you to reconnect in order to execute further queries
   */
  async end() {
    await this.closeConnection();
    this.#terminated = true;
  }
  async #executeQuery(query) {
    return await this.#connection.query(query);
  }
  async queryArray(query_template_or_config, ...args) {
    this.#assertOpenConnection();
    if (this.#transaction !== null) {
      throw new Error(`This connection is currently locked by the "${this.#transaction}" transaction`);
    }
    let query;
    if (typeof query_template_or_config === "string") {
      query = new Query(query_template_or_config, ResultType.ARRAY, args[0]);
    } else if (isTemplateString(query_template_or_config)) {
      query = templateStringToQuery(query_template_or_config, args, ResultType.ARRAY);
    } else {
      query = new Query(query_template_or_config, ResultType.ARRAY);
    }
    return await this.#executeQuery(query);
  }
  async queryObject(query_template_or_config, ...args) {
    this.#assertOpenConnection();
    if (this.#transaction !== null) {
      throw new Error(`This connection is currently locked by the "${this.#transaction}" transaction`);
    }
    let query;
    if (typeof query_template_or_config === "string") {
      query = new Query(query_template_or_config, ResultType.OBJECT, args[0]);
    } else if (isTemplateString(query_template_or_config)) {
      query = templateStringToQuery(query_template_or_config, args, ResultType.OBJECT);
    } else {
      query = new Query(query_template_or_config, ResultType.OBJECT);
    }
    return await this.#executeQuery(query);
  }
  /**
   * Resets the transaction session metadata
   */
  resetSessionMetadata() {
    this.#transaction = null;
  }
};
_computedKey = Symbol.dispose;
var PoolClient = class extends QueryClient {
  #release;
  /**
   * Create a new Client used by the pool
   */
  constructor(config, releaseCallback) {
    super(new Connection(config, async () => {
      await this.closeConnection();
    }));
    this.#release = releaseCallback;
  }
  /**
   * Releases the client back to the pool
   */
  release() {
    this.#release();
    this.resetSessionMetadata();
  }
  [_computedKey]() {
    this.release();
  }
};

// deno:https://deno.land/x/postgres@v0.19.3/pool.ts
var Pool = class {
  #available_connections;
  #connection_params;
  #ended = false;
  #lazy;
  // TODO
  // Initialization should probably have a timeout
  #ready;
  #size;
  /**
   * The number of open connections available for use
   *
   * Lazily initialized pools won't have any open connections by default
   */
  get available() {
    if (!this.#available_connections) {
      return 0;
    }
    return this.#available_connections.available;
  }
  /**
   * The number of total connections open in the pool
   *
   * Both available and in use connections will be counted
   */
  get size() {
    if (!this.#available_connections) {
      return 0;
    }
    return this.#available_connections.size;
  }
  /**
   * A class that manages connection pooling for PostgreSQL clients
   */
  constructor(connection_params, size, lazy = false) {
    this.#connection_params = createParams(connection_params);
    this.#lazy = lazy;
    this.#size = size;
    this.#ready = this.#initialize();
  }
  // TODO
  // Rename to getClient or similar
  // The connect method should initialize the connections instead of doing it
  // in the constructor
  /**
   * This will return a new client from the available connections in
   * the pool
   *
   * In the case of lazy initialized pools, a new connection will be established
   * with the database if no other connections are available
   *
   * ```ts
   * import { Pool } from "https://deno.land/x/postgres/mod.ts";
   * const pool = new Pool({}, 10);
   * const client = await pool.connect();
   * await client.queryArray`UPDATE MY_TABLE SET X = 1`;
   * client.release();
   * ```
   */
  async connect() {
    if (this.#ended) {
      this.#ready = this.#initialize();
    }
    await this.#ready;
    return this.#available_connections.pop();
  }
  /**
   * This will close all open connections and set a terminated status in the pool
   *
   * ```ts
   * import { Pool } from "https://deno.land/x/postgres/mod.ts";
   * const pool = new Pool({}, 10);
   *
   * await pool.end();
   * console.assert(pool.available === 0, "There are connections available after ending the pool");
   * await pool.end(); // An exception will be thrown, pool doesn't have any connections to close
   * ```
   *
   * However, a terminated pool can be reused by using the "connect" method, which
   * will reinitialize the connections according to the original configuration of the pool
   *
   * ```ts
   * import { Pool } from "https://deno.land/x/postgres/mod.ts";
   * const pool = new Pool({}, 10);
   * await pool.end();
   * const client = await pool.connect();
   * await client.queryArray`SELECT 1`; // Works!
   * client.release();
   * ```
   */
  async end() {
    if (this.#ended) {
      throw new Error("Pool connections have already been terminated");
    }
    await this.#ready;
    while (this.available > 0) {
      const client = await this.#available_connections.pop();
      await client.end();
    }
    this.#available_connections = void 0;
    this.#ended = true;
  }
  /**
   * Initialization will create all pool clients instances by default
   *
   * If the pool is lazily initialized, the clients will connect when they
   * are requested by the user, otherwise they will all connect on initialization
   */
  async #initialize() {
    const initialized = this.#lazy ? 0 : this.#size;
    const clients = Array.from({
      length: this.#size
    }, async (_e, index) => {
      const client = new PoolClient(this.#connection_params, () => this.#available_connections.push(client));
      if (index < initialized) {
        await client.connect();
      }
      return client;
    });
    this.#available_connections = new DeferredAccessStack(await Promise.all(clients), (client) => client.connect(), (client) => client.connected);
    this.#ended = false;
  }
  /**
   * This will return the number of initialized clients in the pool
   */
  async initialized() {
    if (!this.#available_connections) {
      return 0;
    }
    return await this.#available_connections.initialized();
  }
};

// src/plugins/shared/interpolate.ts
function getNestedValue(obj, path) {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === void 0) {
      return void 0;
    }
    if (Array.isArray(current)) {
      const index = parseInt(part, 10);
      if (isNaN(index)) {
        return void 0;
      }
      current = current[index];
    } else if (typeof current === "object" && current !== null) {
      current = current[part];
    } else {
      return void 0;
    }
  }
  return current;
}
function parseQueryString(query) {
  const result = {};
  if (!query) return result;
  const params = new URLSearchParams(query);
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}
function resolveVariable(namespace, key, ctx) {
  switch (namespace) {
    case "path":
      return ctx.path[key];
    case "query":
      return ctx.query[key];
    case "body":
      return getNestedValue(ctx.body, key);
    case "auth":
      return getNestedValue(ctx.auth, key);
    default:
      return void 0;
  }
}
function interpolate(template, ctx) {
  const pattern = /\$\{\{(\w+)\.([^}]+)\}\}/g;
  return template.replace(pattern, (_match, namespace, key) => {
    const value = resolveVariable(namespace, key, ctx);
    if (value === void 0 || value === null) {
      return "null";
    }
    if (typeof value === "string") {
      return `'${value.replace(/'/g, "''")}'`;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  });
}

// src/plugins/shared/shape.ts
function resolveJsonPointer(data, pointer) {
  if (pointer === "" || pointer === "/") {
    return data;
  }
  if (!pointer.startsWith("/")) {
    return null;
  }
  const tokens = pointer.split("/").slice(1);
  let current = data;
  for (const token of tokens) {
    if (current === null || current === void 0) {
      return null;
    }
    const key = token.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(current)) {
      const index = parseInt(key, 10);
      if (isNaN(index) || index < 0 || index >= current.length) {
        return null;
      }
      current = current[index];
    } else if (typeof current === "object" && current !== null) {
      if (!(key in current)) {
        return null;
      }
      current = current[key];
    } else {
      return null;
    }
  }
  return current;
}
function applyFieldMapping(obj, fields) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key in fields) {
      result[fields[key]] = value;
    } else {
      result[key] = value;
    }
  }
  return result;
}
function applyFieldMappingToArray(arr, fields) {
  return arr.map((item) => applyFieldMapping(item, fields));
}
function shapeResponse(data, config) {
  let result = data;
  if (config.returns !== void 0) {
    result = resolveJsonPointer(result, config.returns);
  }
  if (config.fields) {
    if (Array.isArray(result)) {
      result = applyFieldMappingToArray(result, config.fields);
    } else if (typeof result === "object" && result !== null) {
      result = applyFieldMapping(result, config.fields);
    }
  }
  return result;
}

// src/plugins/postgres.ts
var pool = null;
async function init(options) {
  const connectionString = `postgresql://${options.user}:${options.password}@${options.host}:${options.port}/${options.database}`;
  pool = new Pool(connectionString, options.max_connections ?? 4, true);
  try {
    const client = await pool.connect();
    try {
      await client.queryObject("SELECT 1");
    } finally {
      client.release();
    }
  } catch (err) {
    pool = null;
    throw new Error(`PostgreSQL connection failed: ${err}`);
  }
  return {
    status: 200
  };
}
async function handle(input) {
  if (pool === null) {
    return {
      status: 500,
      headers: {
        "content-type": "application/json"
      },
      body: {
        error: "PostgreSQL plugin not initialized"
      }
    };
  }
  const ctx = {
    path: input.request.params,
    query: parseQueryString(input.request.query),
    body: input.body ?? null,
    auth: {}
  };
  const interpolatedQuery = interpolate(input.config.query, ctx);
  const client = await pool.connect();
  let result;
  try {
    const queryResult = await client.queryObject(interpolatedQuery);
    result = queryResult.rows;
  } catch (err) {
    return {
      status: 500,
      headers: {
        "content-type": "application/json"
      },
      body: {
        error: `Query execution failed: ${err}`
      }
    };
  } finally {
    client.release();
  }
  const shapeConfig = {
    fields: input.config.fields,
    returns: input.config.returns
  };
  const shapedResult = shapeResponse(result, shapeConfig);
  if (input.config.returns !== void 0 && shapedResult === null) {
    return {
      status: 404,
      headers: {
        "content-type": "application/json"
      },
      body: null
    };
  }
  return {
    status: 200,
    headers: {
      "content-type": "application/json"
    },
    body: shapedResult
  };
}
function validate(config) {
  if (config === null || config === void 0) {
    return {
      valid: false,
      error: "config is required"
    };
  }
  if (typeof config !== "object") {
    return {
      valid: false,
      error: "config must be an object"
    };
  }
  const cfg = config;
  if (typeof cfg.query !== "string" || cfg.query.trim() === "") {
    return {
      valid: false,
      error: "query must be a non-empty string"
    };
  }
  if (cfg.fields !== void 0 && typeof cfg.fields !== "object") {
    return {
      valid: false,
      error: "fields must be an object"
    };
  }
  if (cfg.returns !== void 0 && typeof cfg.returns !== "string") {
    return {
      valid: false,
      error: "returns must be a string"
    };
  }
  return {
    valid: true
  };
}
export {
  handle,
  init,
  validate
};
/*!
 * Adapted directly from https://github.com/brianc/node-buffer-writer
 * which is licensed as follows:
 *
 * The MIT License (MIT)
 *
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * 'Software'), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
/*!
 * Substantial parts adapted from https://github.com/brianc/node-postgres
 * which is licensed as follows:
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2010 - 2019 Brian Carlson
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * 'Software'), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
