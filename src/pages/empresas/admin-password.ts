const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const ALPHABET = UPPERCASE + LOWERCASE + DIGITS;

function randomIndex(length: number): number {
  const bytes = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / length) * length;
  do {
    crypto.getRandomValues(bytes);
  } while (bytes[0] >= limit);
  return bytes[0] % length;
}

export function generateAdminPassword(): string {
  const characters = [
    UPPERCASE[randomIndex(UPPERCASE.length)],
    LOWERCASE[randomIndex(LOWERCASE.length)],
    DIGITS[randomIndex(DIGITS.length)],
  ];
  while (characters.length < 12) {
    characters.push(ALPHABET[randomIndex(ALPHABET.length)]);
  }
  for (let index = characters.length - 1; index > 0; index--) {
    const other = randomIndex(index + 1);
    [characters[index], characters[other]] = [characters[other], characters[index]];
  }
  return characters.join('');
}