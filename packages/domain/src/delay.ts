/** Delay bands (section 6.3): colour and text both come from these. */
import {
  DELAY_MAJOR_MIN,
  DELAY_SLIGHT_MIN,
  type DelayLevel,
} from '@railpulse/shared';

export function delayLevel(delayMin: number): DelayLevel {
  if (delayMin >= DELAY_MAJOR_MIN) return 'major';
  if (delayMin >= DELAY_SLIGHT_MIN) return 'slight';
  return 'ontime';
}
