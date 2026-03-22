import type { SoberHouseAccessRole } from "./types";

export const SOBER_HOUSE_PASSCODE_LENGTH = 7;

export function requiresSoberHouseDeviceUnlock(
  role: SoberHouseAccessRole | null | undefined,
): boolean {
  return role === "OWNER_OPERATOR" || role === "HOUSE_RESIDENT";
}

export function normalizeSoberHousePasscodeInput(value: string): string {
  return value.replace(/\D+/g, "").slice(0, SOBER_HOUSE_PASSCODE_LENGTH);
}

export function isValidSoberHousePasscode(value: string): boolean {
  return normalizeSoberHousePasscodeInput(value).length === SOBER_HOUSE_PASSCODE_LENGTH;
}

function sha256Hex(input: string): string {
  const rightRotate = (value: number, amount: number) =>
    (value >>> amount) | (value << (32 - amount));
  const words: number[] = [];
  const inputBytes = Array.from(input).flatMap((character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint == null) {
      return [];
    }
    if (codePoint <= 0x7f) {
      return [codePoint];
    }
    if (codePoint <= 0x7ff) {
      return [0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f)];
    }
    if (codePoint <= 0xffff) {
      return [
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      ];
    }
    return [
      0xf0 | (codePoint >> 18),
      0x80 | ((codePoint >> 12) & 0x3f),
      0x80 | ((codePoint >> 6) & 0x3f),
      0x80 | (codePoint & 0x3f),
    ];
  });
  const bitLength = inputBytes.length * 8;

  for (let index = 0; index < inputBytes.length; index += 1) {
    words[index >> 2] |= inputBytes[index] << (24 - (index % 4) * 8);
  }
  words[inputBytes.length >> 2] |= 0x80 << (24 - (inputBytes.length % 4) * 8);
  words[(((inputBytes.length + 8) >> 6) + 1) * 16 - 1] = bitLength;

  const initialHash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  const schedule = new Array<number>(64);
  for (let offset = 0; offset < words.length; offset += 16) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = words[offset + index] | 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 =
        rightRotate(schedule[index - 15], 7) ^
        rightRotate(schedule[index - 15], 18) ^
        (schedule[index - 15] >>> 3);
      const s1 =
        rightRotate(schedule[index - 2], 17) ^
        rightRotate(schedule[index - 2], 19) ^
        (schedule[index - 2] >>> 10);
      schedule[index] = (((schedule[index - 16] + s0) | 0) + ((schedule[index - 7] + s1) | 0)) | 0;
    }

    let [a, b, c, d, e, f, g, h] = initialHash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (((((h + sum1) | 0) + choice) | 0) + constants[index] + schedule[index]) | 0;
      const sum0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    initialHash[0] = (initialHash[0] + a) | 0;
    initialHash[1] = (initialHash[1] + b) | 0;
    initialHash[2] = (initialHash[2] + c) | 0;
    initialHash[3] = (initialHash[3] + d) | 0;
    initialHash[4] = (initialHash[4] + e) | 0;
    initialHash[5] = (initialHash[5] + f) | 0;
    initialHash[6] = (initialHash[6] + g) | 0;
    initialHash[7] = (initialHash[7] + h) | 0;
  }

  return initialHash.map((value) => (value >>> 0).toString(16).padStart(8, "0")).join("");
}

export function hashSoberHousePasscode(passcode: string, userId: string): string {
  return sha256Hex(`${userId}::${normalizeSoberHousePasscodeInput(passcode)}::sober-house-lock`);
}

export function verifySoberHousePasscode(
  passcode: string,
  userId: string,
  expectedHash: string | null | undefined,
): boolean {
  if (!expectedHash || !isValidSoberHousePasscode(passcode)) {
    return false;
  }
  return hashSoberHousePasscode(passcode, userId) === expectedHash;
}
