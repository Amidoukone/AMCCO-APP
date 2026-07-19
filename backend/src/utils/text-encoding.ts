const MOJIBAKE_REPLACEMENTS: Array<[string, string]> = [
  ["\u00c3\u0080", "À"],
  ["\u00c3\u20ac", "À"],
  ["\u00c3\u0082", "Â"],
  ["\u00c3\u0087", "Ç"],
  ["\u00c3\u2021", "Ç"],
  ["\u00c3\u0088", "È"],
  ["\u00c3\u02c6", "È"],
  ["\u00c3\u0089", "É"],
  ["\u00c3\u2030", "É"],
  ["\u00c3\u008a", "Ê"],
  ["\u00c3\u0160", "Ê"],
  ["\u00c3\u008b", "Ë"],
  ["\u00c3\u2039", "Ë"],
  ["\u00c3\u008e", "Î"],
  ["\u00c3\u017d", "Î"],
  ["\u00c3\u008f", "Ï"],
  ["\u00c3\u0094", "Ô"],
  ["\u00c3\u201d", "Ô"],
  ["\u00c3\u0099", "Ù"],
  ["\u00c3\u2122", "Ù"],
  ["\u00c3\u009b", "Û"],
  ["\u00c3\u203a", "Û"],
  ["\u00c3\u00a0", "à"],
  ["\u00c3\u00a2", "â"],
  ["\u00c3\u00a7", "ç"],
  ["\u00c3\u00a8", "è"],
  ["\u00c3\u00a9", "é"],
  ["\u00c3\u00aa", "ê"],
  ["\u00c3\u00ab", "ë"],
  ["\u00c3\u00ae", "î"],
  ["\u00c3\u00af", "ï"],
  ["\u00c3\u00b4", "ô"],
  ["\u00c3\u00b9", "ù"],
  ["\u00c3\u00bb", "û"],
  ["\u00c3\u00bc", "ü"],
  ["\u00c5\u0092", "Œ"],
  ["\u00c5\u2019", "Œ"],
  ["\u00c5\u0093", "œ"],
  ["\u00c5\u201c", "œ"],
  ["\u00c2\u00a0", " "],
  ["\u00c2\u00b0", "°"],
  ["\u00c2\u00b2", "²"],
  ["\u00c2\u00b3", "³"],
  ["\u00e2\u20ac\u2122", "'"],
  ["\u00e2\u20ac\u02dc", "'"],
  ["\u00e2\u20ac\u0153", "\""],
  ["\u00e2\u20ac\u009c", "\""],
  ["\u00e2\u20ac\u009d", "\""],
  ["\u00e2\u20ac\ufffd", "\""],
  ["\u00e2\u20ac\u0093", "-"],
  ["\u00e2\u20ac\u201c", "-"],
  ["\u00e2\u20ac\u0094", "-"],
  ["\u00e2\u20ac\u201d", "-"],
  ["\u00e2\u20ac\u00a6", "..."]
];

export function repairMojibakeText(value: string): string {
  let output = value;

  for (const [broken, fixed] of MOJIBAKE_REPLACEMENTS) {
    output = output.split(broken).join(fixed);
  }

  return output.normalize("NFC");
}
