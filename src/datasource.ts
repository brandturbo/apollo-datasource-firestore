import { DataSource } from 'apollo-datasource'
import { InMemoryLRUCache, KeyValueCache } from 'apollo-server-caching'
import { firestore } from 'firebase-admin'

import { Logger, isFirestoreCollection, FirestoreConverter, LibraryFields } from './helpers'
import { createCachingMethods, CachedMethods, FindArgs } from './cache'
import { PartialWithFieldValue, WithFieldValue } from './types'

export interface FirestoreDataSourceOptions {
  logger?: Logger
}

const placeholderHandler = () => {
  throw new Error('DataSource not initialized')
}

export type QueryFindArgs = FindArgs

export class FirestoreDataSource<TData extends LibraryFields, TContext>
  extends DataSource<TContext>
  implements CachedMethods<TData> {
  collection: firestore.CollectionReference<TData>
  context?: TContext
  options: FirestoreDataSourceOptions
  // these get set by the initializer but they must be defined or nullable after the constructor
  // runs, so we guard against using them before init
  findOneById: CachedMethods<TData>['findOneById'] = placeholderHandler
  findManyByIds: CachedMethods<TData>['findManyByIds'] = placeholderHandler
  deleteFromCacheById: CachedMethods<TData>['deleteFromCacheById'] = placeholderHandler
  primeLoader: CachedMethods<TData>['primeLoader'] = placeholderHandler
  dataLoader: CachedMethods<TData>['dataLoader']
  cache: CachedMethods<TData>['cache']
  cachePrefix: CachedMethods<TData>['cachePrefix']

  reviver = placeholderHandler
  replacer = placeholderHandler

  /**
   *
   * @param query
   * @param options
   */
  async findManyByQuery (
    queryFunction: (collection: firestore.CollectionReference<TData>) => firestore.Query<TData>,
    { ttl }: QueryFindArgs = {}
  ) {
    const qSnap = await queryFunction(this.collection).get()
    const results = qSnap.docs.map(dSnap => dSnap.data())
    // prime these into the dataloader and maybe the cache
    if (this.dataLoader && results) {
      await this.primeLoader(results, ttl)
    }
    this.options?.logger?.debug(`FirestoreDataSource/findManyByQuery: complete. rows: ${qSnap.size}, Read Time: ${qSnap.readTime.toDate()}`)
    return results
  }

  async createOne (newDoc: (WithFieldValue<TData> & LibraryFields) | Omit<WithFieldValue<TData>, 'id' | 'collection'>, { ttl }: QueryFindArgs = {}) {
    if ('id' in newDoc) {
      return await this.updateOne(newDoc)
    } else {
      const dRef = await this.collection.add(newDoc as TData)
      const dSnap = await dRef.get()
      const result = dSnap.data()
      if (result) {
        await this.primeLoader(result, ttl)
      }
      this.options?.logger?.debug(`FirestoreDataSource/createOne: created id: ${result?.id ?? ''}`)
      return result
    }
  }

  async deleteOne (id: string) {
    this.options?.logger?.debug(`FirestoreDataSource/deleteOne: deleting id: '${id}'`)
    const response = await this.collection.doc(id).delete()
    await this.deleteFromCacheById(id)
    return response
  }

  async updateOne (data: WithFieldValue<TData> & LibraryFields) {
    this.options?.logger?.debug(`FirestoreDataSource/updateOne: Updating doc id ${data.id}`)
    await this.collection
      .doc(data.id)
      .set(data as TData)

    const dSnap = await this.collection.doc(data.id).get()
    const result = dSnap.data()
    if (result) {
      await this.primeLoader(result)
    }
    return result
  }

  async updateOnePartial (id: string, data: PartialWithFieldValue<TData>) {
    this.options?.logger?.debug(`FirestoreDataSource/updateOnePartial: Updating doc id ${id}`)
    await this.collection
      .doc(id)
      .set(data as TData, { merge: true })

    const dSnap = await this.collection.doc(id).get()
    const result = dSnap.data()
    if (result) {
      await this.primeLoader(result)
    }
    return result
  }

  constructor (collection: firestore.CollectionReference<TData>, options: FirestoreDataSourceOptions = {}) {
    super()
    options?.logger?.debug('FirestoreDataSource started')

    if (!isFirestoreCollection(collection)) {
      throw new Error('FirestoreDataSource must be created with a Firestore collection (from @google-cloud/firestore)')
    }

    this.options = options
    this.collection = collection.withConverter(FirestoreConverter<TData>())
  }

  initialize ({
    context,
    cache
  }: { context?: TContext, cache?: KeyValueCache } = {}) {
    this.context = context

    const methods = createCachingMethods<TData>({
      collection: this.collection,
      cache: cache ?? new InMemoryLRUCache(),
      options: this.options
    })

    Object.assign(this, methods)
  }
}
