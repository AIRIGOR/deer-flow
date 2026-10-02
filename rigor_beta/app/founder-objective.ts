export const maxObjectiveCharacters = 4000;
export function objectiveError(value: string): string | undefined {
  const length = value.trim().length;
  if (length < 8) return 'Describe the work in at least 8 characters.';
  if (length > maxObjectiveCharacters) return `This prompt has ${length.toLocaleString('en-US')} characters. The execution service accepts up to 4,000. Your text has been kept; shorten it or split it into separate commands.`;
}
