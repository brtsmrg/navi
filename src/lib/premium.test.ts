import { describe, expect, it } from 'vitest';
import { splitSegments, spokenForm } from './premium';

describe('premium voice text', () => {
  it('writes numbers out the way the co-driver says them', () => {
    expect(spokenForm('Left 3 tightens, 150, right 2')).toBe('Left three tightens, one fifty, right two.');
    expect(spokenForm('Roundabout, take the 2nd exit')).toBe('Roundabout, take the second exit.');
  });
  it('says a distance in full, in plain words', () => {
    expect(spokenForm('In 110 metres, medium right')).toBe('In one hundred and ten metres, medium right.');
    expect(spokenForm('then in 1200 feet, left')).toBe('then in one thousand two hundred feet, left.');
  });
  it('splits the distance lead-in from the corner so lead-ins are reused between roads', () => {
    expect(splitSegments('In 250 metres, medium right into medium left')).toEqual(['In two hundred and fifty metres,', 'medium right into medium left.']);
    expect(splitSegments('Careful. In 140 metres, easy right, sharp left')).toEqual(['Careful. In one hundred and forty metres,', 'easy right, sharp left.']);
  });
  it('keeps co-driver style calls and warnings whole', () => {
    expect(splitSegments('Left 3 tightens, 150, right 2')).toEqual(['Left three tightens, one fifty, right two.']);
    expect(splitSegments('Slow')).toEqual(['Slow.']);
    expect(splitSegments('5')).toEqual(['five.']);
  });
});
