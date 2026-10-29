import { ToastActionCreators } from "@valenced/discord/actions"
import { Stores } from "@valenced/discord/flux"
import { getModules, lookupModule } from "@valenced/modules/finders"
import {
	withDependencies,
	withName,
	withProps
} from "@valenced/modules/finders/filters"
import { beforeJSX } from "@valenced/react/jsx-runtime"
import { lookupGeneratedIconComponent } from "@valenced/utils/discord"
import type { ComponentType, ReactElement } from "react"

// thanks datamine wumpus
type MarkGuildsAsRead = (
	guildIds: string[],
	context?: string,
	onFinished?: () => void
) => void

// blame @valenced/types
interface GuildStore {
	getGuildIds(): string[]
}

interface GuildReadStateStore {
	getGuildHasUnreadIgnoreMuted(guildId: string): boolean
}

export default plugin({
	start({ cleanup }) {
		const ChatCheckIcon = lookupGeneratedIconComponent("ChatCheckIcon")

		let DMsRow: ComponentType | undefined
		let markGuildsAsRead: MarkGuildsAsRead | undefined

		// pain but okay
		const getMarkGuildsAsRead = () => {
			if (markGuildsAsRead) return markGuildsAsRead

			const [, ackModuleId] = lookupModule(withProps("bulkAck"))
			if (ackModuleId === undefined) return

			const { atLeast, unordered } = withDependencies
			const [exports, id] = lookupModule(
				withName<MarkGuildsAsRead>("markGuildsAsRead").and(
					withDependencies(atLeast(2, unordered([ackModuleId])))
				)
			)
			if (id !== undefined) markGuildsAsRead = exports

			return markGuildsAsRead
		}

		const onMessagesLongPress = () => {
			const { GuildStore, GuildReadStateStore } = Stores as unknown as {
				GuildStore: GuildStore
				GuildReadStateStore: GuildReadStateStore
			}

			const unreadGuildIds = GuildStore.getGuildIds().filter(id =>
				GuildReadStateStore.getGuildHasUnreadIgnoreMuted(id)
			)
			if (!unreadGuildIds.length) return

			const markAsRead = getMarkGuildsAsRead()
			if (!markAsRead) return

			// why undefined? it just for client-sided analytics context
			markAsRead(unreadGuildIds, undefined, () => {
				ToastActionCreators.open("read-all-done", {
					text: `Read ${unreadGuildIds.length} servers!`,
					icon: ChatCheckIcon
				})
			})
		}

		const isMessagesButton = (props: { expandedChildren?: unknown }) =>
			DMsRow !== undefined &&
			(props.expandedChildren as ReactElement | null | undefined)?.type ===
				DMsRow

		cleanup(
			getModules(
				withName<ComponentType>("HomeDrawerDMsRowWrapper"),
				exports => {
					DMsRow = exports
				}
			),
			getModules(
				withName<ComponentType<any>>("GuildsBarAnimatedItemWrapper"),
				GuildsBarItem => {
					cleanup(
						beforeJSX(GuildsBarItem, ([type, props, key]) => {
							if (!isMessagesButton(props)) return [type, props, key]
							return [
								type,
								{
									...props,
									config: {
										...props.config,
										onLongPress: onMessagesLongPress
									}
								},
								key
							]
						})
					)
				}
			)
		)
	}
})
