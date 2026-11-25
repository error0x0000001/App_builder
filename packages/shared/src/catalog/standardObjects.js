import list from './standardObjects.json' with { type: 'json' };

/**
 * The standard objects a tenant can set permissions and sharing for. This is a fixed catalogue until the objects themselves exist as real
 * tables; at that point it is replaced by the objects table and nothing that reads `STANDARD_OBJECTS` needs to change shape.
 */
export const STANDARD_OBJECTS = Object.freeze(list.map((o) => Object.freeze({ ...o })));
export const ALL_OBJECTS = 'All';
export const isKnownObject = (key) => key === ALL_OBJECTS || STANDARD_OBJECTS.some((o) => o.key === key);
