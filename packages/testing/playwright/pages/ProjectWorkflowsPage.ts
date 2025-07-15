import type { Locator } from '@playwright/test';

import { BasePage } from './BasePage';

export class ProjectWorkflowsPage extends BasePage {
	async clickCreateWorkflowButton() {
		await this.clickByTestId('add-resource-workflow');
	}

	async clickProjectMenuItem(projectName: string) {
		await this.page.getByTestId('project-menu-item').filter({ hasText: projectName }).click();
	}

	async searchWorkflows(searchTerm: string) {
		await this.clickByTestId('resources-list-search');
		await this.fillByTestId('resources-list-search', searchTerm);
	}

	getWorkflowItems() {
		return this.page.getByTestId('resources-list-item-workflow');
	}

	getArchiveMenuItem() {
		return this.page.getByRole('menuitem', { name: 'Archive' });
	}

	async archiveWorkflow(workflowItem: Locator) {
		await workflowItem.getByTestId('workflow-card-actions').click();
		await this.getArchiveMenuItem().click();
	}

	getWorkflowByName(name: string) {
		return this.getWorkflowItems().filter({ hasText: name });
	}

	/**
	 * Get the new workflow card
	 */
	getNewWorkflowCard() {
		return this.page.getByTestId('new-workflow-card');
	}

	/**
	 * Get the search bar input field
	 */
	getSearchBar() {
		return this.page.getByTestId('resources-list-search');
	}

	/**
	 * Clear the search bar
	 */
	async clearSearch() {
		const searchBar = this.getSearchBar();
		await searchBar.click();
		await searchBar.clear();
	}

	/**
	 * Get workflow filter button
	 */
	getWorkflowFilterButton() {
		return this.page.getByTestId('workflow-filter-button');
	}

	/**
	 * Get workflow tags dropdown
	 */
	getWorkflowTagsDropdown() {
		return this.page.getByTestId('workflow-tags-dropdown');
	}

	/**
	 * Get workflow tag item
	 */
	getWorkflowTagItem(tagName: string) {
		return this.page.getByTestId('workflow-tag-item').filter({ hasText: tagName });
	}

	/**
	 * Get workflow sort dropdown
	 */
	getWorkflowSortDropdown() {
		return this.page.getByTestId('workflow-sort-dropdown');
	}

	/**
	 * Get workflow sort item
	 */
	getWorkflowSortItem(sortOption: string) {
		return this.page.getByRole('option', { name: sortOption });
	}

	/**
	 * Get workflow list page size dropdown
	 */
	getWorkflowListPageSizeDropdown() {
		return this.page.getByTestId('workflow-page-size-dropdown');
	}

	/**
	 * Get workflow list page size item
	 */
	getWorkflowListPageSizeItem(size: string) {
		return this.page.getByRole('option', { name: size });
	}

	/**
	 * Get workflow archived checkbox
	 */
	getWorkflowArchivedCheckbox() {
		return this.page.getByTestId('workflow-archived-checkbox');
	}

	/**
	 * Get workflows list container
	 */
	getWorkflowsListContainer() {
		return this.page.getByTestId('workflows-list-container');
	}

	/**
	 * Get workflow card actions button by workflow name
	 */
	getWorkflowCardActions(workflowName: string) {
		return this.getWorkflowByName(workflowName).getByTestId('workflow-card-actions');
	}

	/**
	 * Get unarchive menu item
	 */
	getUnarchiveMenuItem() {
		return this.page.getByRole('menuitem', { name: 'Unarchive' });
	}

	/**
	 * Get delete menu item
	 */
	getDeleteMenuItem() {
		return this.page.getByRole('menuitem', { name: 'Delete' });
	}

	/**
	 * Get share menu item
	 */
	getShareMenuItem() {
		return this.page.getByRole('menuitem', { name: 'Share' });
	}

	/**
	 * Unarchive a workflow
	 */
	async unarchiveWorkflow(workflowItem: Locator) {
		await workflowItem.getByTestId('workflow-card-actions').click();
		await this.getUnarchiveMenuItem().click();
	}

	/**
	 * Delete a workflow
	 */
	async deleteWorkflow(workflowItem: Locator) {
		await workflowItem.getByTestId('workflow-card-actions').click();
		await this.getDeleteMenuItem().click();
		// Confirm deletion
		await this.page.getByRole('button', { name: 'delete' }).click();
	}

	/**
	 * Share a workflow
	 */
	async shareWorkflow(workflowName: string) {
		await this.getWorkflowCardActions(workflowName).click();
		await this.getShareMenuItem().click();
	}
}
