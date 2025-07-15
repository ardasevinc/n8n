import type { Locator } from '@playwright/test';

import { BasePage } from './BasePage';
import { resolveFromRoot } from '../utils/path-helper';

export class WorkflowsPage extends BasePage {
	async clickNewWorkflowCard() {
		await this.clickByTestId('new-workflow-card');
	}

	async clickAddFirstProjectButton() {
		await this.clickByTestId('add-first-project-button');
	}

	async clickAddProjectButton() {
		await this.clickByTestId('project-plus-button');
	}

	async clickAddWorklowButton() {
		await this.clickByTestId('add-resource-workflow');
	}

	/**
	 * Import a workflow from a fixture file
	 * @param fixtureKey - The key of the fixture file to import
	 * @param workflowName - The name of the workflow to import
	 * Naming the file causes the workflow to save so we don't need to click save
	 */
	async importWorkflow(fixtureKey: string, workflowName: string) {
		await this.clickByTestId('workflow-menu');

		const [fileChooser] = await Promise.all([
			this.page.waitForEvent('filechooser'),
			this.clickByText('Import from File...'),
		]);
		await fileChooser.setFiles(resolveFromRoot('workflows', fixtureKey));
		await this.page.waitForTimeout(250);

		await this.clickByTestId('inline-edit-preview');
		await this.fillByTestId('inline-edit-input', workflowName);
		await this.page.getByTestId('inline-edit-input').press('Enter');
	}

	workflowTags() {
		return this.page.getByTestId('workflow-tags').locator('.el-tag');
	}

	/**
	 * Get the new workflow card (empty state)
	 */
	getNewWorkflowCard() {
		return this.page.getByTestId('new-workflow-card');
	}

	/**
	 * Clear the search input
	 */
	async clearSearch() {
		await this.clickByTestId('resources-list-search');
		await this.page.getByTestId('resources-list-search').clear();
	}

	/**
	 * Get the search bar for assertions
	 */
	getSearchBar() {
		return this.page.getByTestId('resources-list-search');
	}

	// Filter-related methods
	getWorkflowFilterButton() {
		return this.page.getByTestId('workflow-filter-button');
	}

	getWorkflowTagsDropdown() {
		return this.page.getByTestId('workflow-tags-dropdown');
	}

	getWorkflowTagItem(tagName: string) {
		return this.page.getByTestId('workflow-tag-item').filter({ hasText: tagName });
	}

	getWorkflowArchivedCheckbox() {
		return this.page.getByTestId('workflow-archived-checkbox');
	}

	// Action methods
	async unarchiveWorkflow(workflowItem: Locator) {
		await workflowItem.getByTestId('workflow-card-actions').click();
		await this.page.getByRole('menuitem', { name: 'Unarchive' }).click();
	}

	async deleteWorkflow(workflowItem: Locator) {
		await workflowItem.getByTestId('workflow-card-actions').click();
		await this.page.getByRole('menuitem', { name: 'Delete' }).click();
		await this.page.getByRole('button', { name: 'delete' }).click();
	}
	async searchWorkflows(searchTerm: string) {
		await this.clickByTestId('resources-list-search');
		await this.fillByTestId('resources-list-search', searchTerm);
	}
	getWorkflowItems() {
		return this.page.getByTestId('resources-list-item-workflow');
	}
	getWorkflowByName(name: string) {
		return this.getWorkflowItems().filter({ hasText: name });
	}
	async shareWorkflow(workflowName: string) {
		const workflow = this.getWorkflowByName(workflowName);
		await workflow.getByTestId('workflow-card-actions').click();
		await this.page.getByRole('menuitem', { name: 'Share' }).click();
	}
	getArchiveMenuItem() {
		return this.page.getByRole('menuitem', { name: 'Archive' });
	}

	async archiveWorkflow(workflowItem: Locator) {
		await workflowItem.getByTestId('workflow-card-actions').click();
		await this.getArchiveMenuItem().click();
	}

	/**
	 * Get the filters trigger button
	 */
	getFiltersButton() {
		return this.page.getByTestId('resources-list-filters-trigger');
	}

	/**
	 * Open the filters panel
	 */
	async openFilters() {
		await this.clickByTestId('resources-list-filters-trigger');
	}

	/**
	 * Close the filters panel (by clicking the trigger again)
	 */
	async closeFilters() {
		await this.clickByTestId('resources-list-filters-trigger');
	}

	/**
	 * Get show archived checkbox
	 */
	getShowArchivedCheckbox() {
		return this.page.getByTestId('show-archived-checkbox');
	}

	/**
	 * Toggle show archived workflows
	 */
	async toggleShowArchived() {
		await this.openFilters();
		await this.getShowArchivedCheckbox().locator('span').nth(1).click();
		await this.closeFilters();
	}

	/**
	 * Get status dropdown
	 */
	getStatusDropdown() {
		return this.page.getByTestId('status-dropdown');
	}

	/**
	 * Select a status filter (for active/deactivated workflows)
	 * @param status - 'All', 'Active', or 'Deactivated'
	 */
	async selectStatusFilter(status: 'All' | 'Active' | 'Deactivated') {
		await this.openFilters();
		await this.getStatusDropdown().getByRole('combobox', { name: 'Select' }).click();
		if (status === 'All') {
			await this.page.getByRole('option', { name: 'All' }).click();
		} else {
			await this.page.getByText(status, { exact: true }).click();
		}
		await this.closeFilters();
	}

	/**
	 * Get tags filter dropdown
	 */
	getTagsDropdown() {
		return this.page.getByTestId('tags-dropdown');
	}

	/**
	 * Select tags to filter by
	 * @param tags - Array of tag names to select
	 */
	async filterByTags(tags: string[]) {
		await this.openFilters();
		await this.clickByTestId('tags-dropdown');

		for (const tag of tags) {
			await this.page.getByRole('option', { name: tag }).locator('span').click();
		}

		// Click outside to close the dropdown
		await this.page.locator('body').click({ position: { x: 0, y: 0 } });
		await this.closeFilters();
	}

	/**
	 * Select a single tag to filter by
	 * @param tag - Tag name to filter by
	 */
	async filterByTag(tag: string) {
		await this.filterByTags([tag]);
	}
}
