import { nanoid } from 'nanoid';

// Prefixed, readable ids (e.g. cyc_ab12cd34ef) so entities are recognizable in logs/exports.
export const id = (prefix) => `${prefix}_${nanoid(10)}`;
