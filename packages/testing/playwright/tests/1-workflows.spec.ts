import { test, expect } from '../fixtures/base';

test.describe('Workflows', () => {
	test.beforeEach(async ({ n8n }) => {
		await n8n.goHome();
	});

	test('should create a new workflow using empty state card @db:reset', async ({ n8n }) => {
		await n8n.workflows.clickNewWorkflowCard();
		await n8n.workflows.importWorkflow('Test_workflow_1.json', 'Empty State Card Workflow');

		// Verify tags were imported
		await expect(n8n.workflows.workflowTags()).toHaveText(['some-tag-1', 'some-tag-2']);
	});

	test('should create a new workflow using add workflow button', async ({ n8n }) => {
		await n8n.workflows.clickAddWorklowButton();

		const workflowName = `Test Workflow ${Date.now()}`;
		await n8n.canvas.setWorkflowName(workflowName);
		await n8n.canvas.clickSaveWorkflowButton();

		await expect(
			n8n.notifications.notificationContainerByText('Workflow successfully created'),
		).toBeVisible();
	});

	test('should search for workflows', async ({ n8n }) => {
		// Create 2 workflows with different names
		const date = Date.now();
		const specificName = `Specific Test ${date}`;
		const genericName = `Generic Test ${date}`;

		await n8n.workflowComposer.createWorkflow(specificName);
		await n8n.goHome();
		await n8n.workflowComposer.createWorkflow(genericName);
		await n8n.goHome();

		// Search for specific workflow
		await n8n.workflows.searchWorkflows(specificName);
		await expect(n8n.workflows.getWorkflowItems()).toHaveCount(1);
		await expect(n8n.workflows.getWorkflowByName(specificName)).toBeVisible();

		// Search with partial term
		await n8n.workflows.clearSearch();
		await n8n.workflows.searchWorkflows(date.toString());
		await expect(n8n.workflows.getWorkflowItems()).toHaveCount(2); // Show both with date in name

		// Search for non-existent
		await n8n.workflows.clearSearch();
		await n8n.workflows.searchWorkflows('NonExistentWorkflow123');
		await expect(n8n.workflows.getWorkflowItems()).toHaveCount(0);
		await expect(n8n.page.getByText('No workflows found')).toBeVisible();
	});

	test('should archive and unarchive a workflow', async ({ n8n }) => {
		// Create one workflow
		const workflowName = `Archive Test ${Date.now()}`;
		await n8n.workflowComposer.createWorkflow(workflowName);
		await n8n.goHome();

		// Archive it
		const workflow = n8n.workflows.getWorkflowByName(workflowName);
		await n8n.workflows.archiveWorkflow(workflow);
		await expect(n8n.notifications.notificationContainerByText('archived')).toBeVisible();

		// It should disappear from the list
		await expect(workflow).toBeHidden();

		// Show archived workflows
		await n8n.workflows.toggleShowArchived();

		// Should be visible again
		await expect(workflow).toBeVisible();

		// Unarchive it
		await n8n.workflows.unarchiveWorkflow(workflow);
		await expect(n8n.notifications.notificationContainerByText('unarchived')).toBeVisible();
	});

	test('should delete an archived workflow', async ({ n8n }) => {
		const workflowName = `Delete Test ${Date.now()}`;
		await n8n.workflowComposer.createWorkflow(workflowName);
		await n8n.goHome();

		// Archive it first
		const workflow = n8n.workflows.getWorkflowByName(workflowName);
		await n8n.workflows.archiveWorkflow(workflow);
		await expect(n8n.notifications.notificationContainerByText('archived')).toBeVisible();

		// Show archived workflows
		await n8n.workflows.toggleShowArchived();

		// Delete it
		await n8n.workflows.deleteWorkflow(workflow);
		await expect(n8n.notifications.notificationContainerByText('deleted')).toBeVisible();

		// Verify it's gone
		await expect(workflow).toBeHidden();
	});

	test('should filter workflows by tag', async ({ n8n }) => {
		// Create two workflows with different tags
		await n8n.workflows.clickAddWorklowButton();
		const date = Date.now();
		await n8n.workflows.importWorkflow('Test_workflow_1.json', `Workflow with some-tag ${date}`);

		await n8n.goHome();
		await n8n.workflows.clickAddWorklowButton();
		await n8n.workflows.importWorkflow('Test_workflow_2.json', `Workflow with other-tag ${date}`);

		await n8n.goHome();

		// Filter by some-tag-1
		await n8n.workflows.filterByTag('some-tag-1');

		// Should only show workflow with that tag
		await expect(n8n.workflows.getWorkflowByName(`Workflow with some-tag ${date}`)).toBeVisible();
	});

	test('should preserve search and filters in URL', async ({ n8n }) => {
		// Create a workflow with tags for filtering
		await n8n.workflows.clickAddWorklowButton();
		const date = Date.now();
		await n8n.workflows.importWorkflow('Test_workflow_2.json', `My Tagged Workflow ${date}`);
		await n8n.goHome();

		// Apply search
		await n8n.workflows.searchWorkflows('Tagged');

		// Apply tag filter
		await n8n.workflows.filterByTag('other-tag-1');

		// Verify URL contains filters
		await expect(n8n.page).toHaveURL(/search=Tagged/);
		await expect(n8n.page).toHaveURL(/tags=/);

		// Reload and verify filters persist
		await n8n.page.reload();

		await expect(n8n.workflows.getSearchBar()).toHaveValue('Tagged');
		await expect(n8n.workflows.getWorkflowByName(`My Tagged Workflow ${date}`)).toBeVisible();
	});

	test('should share a workflow', async ({ n8n }) => {
		const workflowName = `Share Test ${Date.now()}`;
		await n8n.workflowComposer.createWorkflow(workflowName);
		await n8n.goHome();

		await n8n.workflows.shareWorkflow(workflowName);
		// await expect(n8n.workflowSharingModal.getModal()).toBeVisible();
	});
});
