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
}
