export type DiffLine = { kind: "same" | "add" | "del"; text: string };

// Line diff via LCS. Strategy files are a few hundred lines, so O(n*m) is fine.
export function diffLines(a: string, b: string): DiffLine[] {
  const A = a.split("\n");
  const B = b.split("\n");
  const n = A.length;
  const m = B.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ kind: "same", text: A[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: "del", text: A[i++] });
    else out.push({ kind: "add", text: B[j++] });
  }
  while (i < n) out.push({ kind: "del", text: A[i++] });
  while (j < m) out.push({ kind: "add", text: B[j++] });
  return out;
}
