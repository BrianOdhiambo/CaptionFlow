import test from 'node:test';
import assert from 'node:assert/strict';
import { sentenceReplayRange } from '../src/player-sync.mjs';

const cue = (id, start, end, originalText, displayText = originalText) =>
  ({ id, start, end, originalText, displayText });

const spoken = [
  cue('a', 0, 2, 'The health ministry has announced'),
  cue('b', 2, 4, 'a new campaign. Residents should'),
  cue('c', 4, 6, 'visit the clinic before Friday'),
  cue('d', 6, 8, 'for a free checkup.'),
  cue('e', 8, 10, 'The next event will be online.'),
];

test('replays from the last full stop even if it was within an earlier cue', () => {
  const range = sentenceReplayRange(spoken, 5);
  assert.equal(range.startCue.id, 'b');
  assert.equal(range.currentCue.id, 'c');
  assert.equal(range.endCue.id, 'd');
  assert.equal(range.usedSentenceBoundary, true);
});

test('starts at the next cue when the previous caption ends a sentence', () => {
  const range = sentenceReplayRange(spoken, 9);
  assert.equal(range.startCue.id, 'e');
  assert.equal(range.endCue.id, 'e');
});

test('replays the whole unfinished first sentence from its beginning', () => {
  const range = sentenceReplayRange(spoken, 1);
  assert.equal(range.startCue.id, 'a');
  assert.equal(range.endCue.id, 'b');
});

test('question marks and exclamation points also divide spoken sentences', () => {
  const cues = [cue('a', 0, 2, 'Where is the clinic?'), cue('b', 2, 4, 'It is nearby!'), cue('c', 4, 6, 'Visit on Monday.')];
  assert.equal(sentenceReplayRange(cues, 2.4).startCue.id, 'b');
  assert.equal(sentenceReplayRange(cues, 5).startCue.id, 'c');
});

test('source speech punctuation controls replay even when captions are translated', () => {
  const translated = spoken.map(c => ({...c, displayText: 'Huu ni mfano wa sentensi.'}));
  assert.equal(sentenceReplayRange(translated, 5).startCue.id, 'b');
  assert.equal(sentenceReplayRange(translated, 5).endCue.id, 'd');
});

test('ignores common title abbreviations instead of starting in the wrong sentence', () => {
  const cues = [cue('a', 0, 2, 'The doctor is Dr.'), cue('b', 2, 4, 'Mwangi who helps the team'), cue('c', 4, 6, 'at the clinic.')];
  assert.equal(sentenceReplayRange(cues, 3).startCue.id, 'a');
});

test('handles decimals without treating the decimal point as a sentence stop', () => {
  const cues = [cue('a', 0, 2, 'The reading is 3.5'), cue('b', 2, 4, 'today and should be monitored.')];
  assert.equal(sentenceReplayRange(cues, 3).startCue.id, 'a');
});

test('uses bounded earlier context when ASR has no sentence punctuation', () => {
  const cues = Array.from({length:30},(_,i) => cue(String(i), i*2, (i+1)*2, 'speech continues with no punctuation'));
  const range = sentenceReplayRange(cues, 55);
  assert.equal(range.currentCue.id, '27');
  assert.equal(range.startCue.id, '20');
  assert.equal(range.usedSentenceBoundary, false);
});

test('replays current sentence after silence and at end of video', () => {
  const cues = [cue('a', 0, 1, 'First sentence.'), cue('b', 3, 5, 'Second sentence.')];
  assert.equal(sentenceReplayRange(cues, 8).startCue.id, 'b');
  assert.equal(sentenceReplayRange(cues, 2).startCue.id, 'a');
});

test('returns null for empty captions and invalid negative media time', () => {
  assert.equal(sentenceReplayRange([], 10), null);
  assert.equal(sentenceReplayRange(spoken, -1), null);
});


test('does not suppress manual reading pauses indefinitely for unpunctuated speech', () => {
  const cues = Array.from({length:30},(_,i) => cue(String(i), i*2, (i+1)*2, 'spoken words without punctuation'));
  const range = sentenceReplayRange(cues, 21);
  assert.equal(range.currentCue.id, '10');
  assert.equal(range.endCue.id, '17');
});