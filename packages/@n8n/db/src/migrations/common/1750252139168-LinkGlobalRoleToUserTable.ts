import type { MigrationContext, ReversibleMigration } from '../migration-types';

/*
 * We introduce roles tables, these will hold all roles that we know about.
 * There is a roles table for each possible context, such as global roles,
 * project roles, etc.
 *
 * The reason for using separate tables is to allow for different roles contexts
 * and to have strong database constraints for each context. We can enforce FK
 * constraints to match the correct context.
 *
 * There are roles that can't be edited by users, these are marked as system-only and will
 * be managed by the system itself. On every startup, the system will ensure
 * that these roles are synchronized.
 *
 * ColumnName  | Type | Description
 * =================================
 * slug        | Text | Unique identifier of the role for example: 'global:owner'
 * displayName | Text | Name used to display in the UI
 * description | Text | Text describing the scope in more detail of users
 * system-role | Bool | Indicates if the role is managed by the system and cannot be edited by users
 *
 * Each role table will have a unique slug for each role.
 *
 * For each role table there is a junction table that will hold the
 * relationships between the roles and the scopes that are associated with them.
 */

export class LinkGlobalRoleToUserTable1750252139168 implements ReversibleMigration {
	async up({ schemaBuilder: { addForeignKey }, escape, runQuery }: MigrationContext) {
		const tableName = escape.tableName('global_role');
		const userTableName = escape.tableName('user');

		// Make sure that the global roles that we need exist
		await runQuery(`INSERT INTO ${tableName} (slug) VALUES (:slug)`, {
			name: 'global:owner',
		});
		await runQuery(`INSERT INTO ${tableName} (slug) VALUES (:slug)`, {
			name: 'global:admin',
		});
		await runQuery(`INSERT INTO ${tableName} (slug) VALUES (:slug)`, {
			name: 'global:member',
		});

		// Fallback to 'global:member' for users that do not have a correct role set
		// This should not happen in a correctly set up system, but we want to ensure
		// that all users have a role set, before we add the foreign key constraint
		await runQuery(
			`UPDATE ${userTableName} SET role = 'global:member' WHERE NOT EXISTS (SELECT 1 FROM ${tableName} WHERE slug = role)`,
		);

		await addForeignKey('user', 'role', ['global_role', 'slug']);
	}

	async down({ schemaBuilder: { dropForeignKey } }: MigrationContext) {
		await dropForeignKey('user', 'role', ['global_role', 'slug']);
	}
}
