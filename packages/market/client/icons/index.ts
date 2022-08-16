import { icons } from '@koishijs/client'

import NavDeps from './activity/deps.vue'
import NavMarket from './activity/market.vue'
import NavPlugin from './activity/plugin.vue'

import CategoryBusiness from './category/business.vue'
import CategoryGame from './category/game.vue'
import CategoryOther from './category/other.vue'
import CategoryStorage from './category/storage.vue'

import AddGroup from './settings/add-group.vue'
import AddPlugin from './settings/add-plugin.vue'
import TrashCan from './settings/trash-can.vue'
import Check from './settings/check.vue'
import Play from './settings/play.vue'
import Stop from './settings/stop.vue'
import Save from './settings/save.vue'

icons.register('activity:deps', NavDeps)
icons.register('activity:market', NavMarket)
icons.register('activity:plugin', NavPlugin)

icons.register('category:business', CategoryBusiness)
icons.register('category:game', CategoryGame)
icons.register('category:other', CategoryOther)
icons.register('category:storage', CategoryStorage)

icons.register('add-plugin', AddPlugin)
icons.register('add-group', AddGroup)
icons.register('trash-can', TrashCan)
icons.register('check', Check)
icons.register('play', Play)
icons.register('stop', Stop)
icons.register('save', Save)
