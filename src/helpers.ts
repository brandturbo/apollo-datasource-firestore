import { firestore } from 'firebase-admin'
import { PartialWithFieldValue } from './types'

export const isFirestoreCollection = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  maybeCollection: any
): maybeCollection is firestore.CollectionReference => {
  return (
    maybeCollection.id &&
    maybeCollection.path &&
    maybeCollection.firestore &&
    maybeCollection.doc
  )
}

export interface LibraryFields {
  readonly id: string
  readonly collection: string
}

export const FirestoreConverter = <TData extends LibraryFields>(): firestore.FirestoreDataConverter<TData> => ({
  toFirestore: ({ id, collection, ...data }: PartialWithFieldValue<TData>) => data,
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  fromFirestore: (snap: FirebaseFirestore.QueryDocumentSnapshot) => ({ id: snap.id, collection: snap.ref.parent.id, ...snap.data() }) as TData
})

export interface Logger {
  // Ordered from least-severe to most-severe.
  debug: (message?: string) => void
  info: (message?: string) => void
  warn: (message?: string) => void
  error: (message?: string) => void
}

const symbolMatch = /^\$\$(Timestamp|GeoPoint|DocumentReference)\$\$:/

export function reviverFactory (collection: firestore.CollectionReference) {
  return function reviver (key: string | number, value: any) {
    if (typeof value === 'string' && symbolMatch.test(value)) {
      const split = value.split(':')
      switch (split[0]) {
        case '$$Timestamp$$':
          return new firestore.Timestamp(parseInt(split[1], 10), parseInt(split[2], 10))
        case '$$DocumentReference$$':
          return collection.firestore.doc(split[1])
        case '$$GeoPoint$$':
          return new firestore.GeoPoint(parseFloat(split[1]), parseFloat(split[2]))
        default:
          return value
      }
    } else return value
  }
}

export function replacer (key: string | number, value: any) {
  if (value instanceof firestore.Timestamp) {
    return `$$Timestamp$$:${value.seconds}:${value.nanoseconds}`
  } else if (value instanceof firestore.DocumentReference) {
    return `$$DocumentReference$$:${value.path}`
  } else if (value instanceof firestore.GeoPoint) {
    return `$$GeoPoint$$:${value.latitude}:${value.longitude}`
  } else return value
}
