import { test, expect } from '../fixtures/base';

// Example of importing a workflow from a file
test.describe('Workflows', () => {
	test('should create a new workflow using empty state card @db:reset', async ({ n8n }) => {
		await n8n.goHome();
		await n8n.workflows.clickNewWorkflowCard();
		await n8n.workflows.importWorkflow('Test_workflow_1.json', 'Empty State Card Workflow');
		await expect(n8n.workflows.workflowTags()).toHaveText(['some-tag-1', 'some-tag-2']);
	});

	test('should create multiple new workflows using add workflow button', async ({ n8n }) => {
		for (let i = 0; i < 2; i++) {
			await n8n.goHome();
			await n8n.workflows.clickAddWorklowButton();
			await expect(n8n.canvas.canvasAddButton()).toBeVisible();
		}
	});

	test('should search for a workflow', async ({ n8n }) => {
		await n8n.goHome();
		const uniqueWorkflowName = `Workflow ${Date.now()}`;
		await n8n.workflowComposer.createWorkflow(uniqueWorkflowName);
		await n8n.goHome();
		await n8n.projectWorkflows.searchWorkflows(uniqueWorkflowName);
		await expect(n8n.projectWorkflows.getWorkflowItems()).toHaveCount(1);
	});

	test('should archive a workflow', async ({ n8n }) => {
		await n8n.goHome();
		const uniqueWorkflowName = `Workflow ${Date.now()}`;
		await n8n.workflowComposer.createWorkflow(uniqueWorkflowName);
		await n8n.goHome();
		const workflowItem = n8n.projectWorkflows.getWorkflowByName(uniqueWorkflowName);
		await n8n.projectWorkflows.archiveWorkflow(workflowItem);
		await expect(n8n.notifications.notificationContainerByText('archived')).toBeVisible();
	});
});
