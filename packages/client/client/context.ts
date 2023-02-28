import * as cordis from 'cordis'
import { Dict, remove } from 'cosmokit'
import { App, Component, markRaw, reactive } from 'vue'
import { Activity } from './activity'

// layout api

export type Computed<T> = T | (() => T)

export interface SlotOptions {
  type: string
  order?: number
  component: Component
}

export const views = reactive<Dict<SlotOptions[]>>({})

export interface Events<C extends Context> extends cordis.Events<C> {
  'activity'(activity: Activity): boolean
}

export interface Context {
  [Context.events]: Events<this>
}

export class Context extends cordis.Context {
  static app: App

  /** @deprecated */
  addView(options: SlotOptions) {
    return this.slot(options)
  }

  /** @deprecated */
  addPage(options: Activity.Options) {
    return this.page(options)
  }

  slot(options: SlotOptions) {
    options.order ??= 0
    markRaw(options.component)
    const list = views[options.type] ||= []
    const index = list.findIndex(a => a.order < options.order)
    if (index >= 0) {
      list.splice(index, 0, options)
    } else {
      list.push(options)
    }
    return this.scope.collect('view', () => remove(list, options))
  }

  page(options: Activity.Options) {
    const activity = new Activity(options)
    return this.scope.collect('page', () => {
      return activity.dispose()
    })
  }
}