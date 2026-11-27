<script lang="ts">
/** 技能页主体（有机体）：配置数据筛选与技能卡片编排。 */
import Chips from "@components/atoms/action/Chips.svelte";
import Card from "@components/atoms/display/Card.svelte";
import PageHeader from "@components/molecules/PageHeader.svelte";
import SkillCard from "@components/molecules/SkillCard.svelte";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import type { SkillCategory, SkillItem } from "@/types/skillsConfig";

let {
	categories = [] as SkillCategory[],
	items = [] as SkillItem[],
	title = i18n(I18nKey.skills),
	subtitle = i18n(I18nKey.skillsBanner),
}: {
	categories?: SkillCategory[];
	items?: SkillItem[];
	title?: string;
	subtitle?: string;
} = $props();

let selectedCategory = $state("");
const enabledItems = $derived(items.filter((item) => item.enable !== false));
const activeCategories = $derived(
	categories.filter((category) =>
		enabledItems.some((item) => item.category === category.key),
	),
);
const categoryItems = $derived(
	activeCategories.map((category) => ({
		value: category.key,
		label: category.label,
		leadingIcon: category.icon ?? "",
	})),
);
const filteredItems = $derived(
	selectedCategory
		? enabledItems.filter((item) => item.category === selectedCategory)
		: enabledItems,
);
</script>

<Card color="var(--card-bg)" radius="l" class="skills-section px-8 py-6">
	<PageHeader
		icon="material-symbols:workspaces-outline-rounded"
		{title}
		{subtitle}
	/>

	{#if categoryItems.length > 1}
		<div class="skills-section__filters" aria-label={i18n(I18nKey.skillCategories)}>
			<Chips items={categoryItems} variant="filter" bind:value={selectedCategory} />
		</div>
	{/if}

	{#if filteredItems.length > 0}
		<p class="skills-section__count">{filteredItems.length} {i18n(I18nKey.skillsCounts)}</p>

		<div class="skills-section__grid" aria-live="polite">
			{#each filteredItems as skill, index (skill.name)}
				<SkillCard {skill} delay={Math.min(index, 7) * 45} />
			{/each}
		</div>
	{:else}
		<!-- 数据为空或筛选无结果时的空状态提示 -->
		<div class="skills-section__empty">
			<Icon icon="material-symbols:search-off-outline-rounded" aria-hidden="true" />
			<span>{i18n(I18nKey.skillsNoResults)}</span>
		</div>
	{/if}
</Card>

<style lang="stylus">
@import "../../styles/breakpoints.styl"

.skills-section
	display: block

	@media (max-width: bp-sm - 1px)
		padding: 1rem 0.75rem

	&__filters
		padding-bottom: 1rem
		border-bottom: 1px solid var(--outline-variant)

	&__count
		margin: 1rem 0
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)

	&__grid
		display: grid
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr))
		gap: 0.75rem

	&__empty
		display: flex
		flex-direction: column
		align-items: center
		justify-content: center
		gap: 0.875rem
		min-height: 12rem
		padding-top: 1.5rem
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-large)

		> :global(svg)
			width: 2.75rem
			height: 2.75rem
			color: var(--outline)
</style>
