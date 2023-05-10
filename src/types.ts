import { firestore } from 'firebase-admin'

/**
 * Similar to Typescript's `Partial<T>`, but allows nested fields to be
 * omitted and FieldValues to be passed in as property values.
 */
export type PartialWithFieldValue<T> =
  | Partial<T>
  | (T extends Primitive
    ? T
    : T extends {}
      ? { [K in keyof T]?: PartialWithFieldValue<T[K]> | firestore.FieldValue }
      : never)

/**
 * Allows FieldValues to be passed in as a property value while maintaining
 * type safety.
 */
export type WithFieldValue<T> =
  | T
  | (T extends Primitive
    ? T
    : T extends {}
      ? { [K in keyof T]: WithFieldValue<T[K]> | firestore.FieldValue }
      : never)

export type Primitive = string | number | boolean | undefined | null;
