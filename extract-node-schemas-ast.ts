#!/usr/bin/env tsx

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import * as ts from 'typescript';

interface ExtractedNodeSchema {
  displayName: string;
  name: string;
  description?: string;
  group?: string[];
  version: number | number[];
  icon?: string;
  parameters: ExtractedParameterSchema[];
  exampleWorkflowNode?: any;
  credentials?: any[];
  webhookId?: boolean;
  polling?: boolean;
  supportsCORS?: boolean;
  extractionQuality: 'high' | 'medium' | 'low';
  extractionNotes: string[];
}

interface ExtractedParameterSchema {
  name: string;
  displayName: string;
  type: string;
  default: any;
  description?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: any[];
  displayOptions?: any;
  typeOptions?: any;
  routing?: any;
  modes?: any[];
  extractValue?: any;
  nested?: ExtractedParameterSchema[];
  exampleValue?: any;
  workflowJsonStructure?: any;
}

interface NodeSchemaDatabase {
  generatedAt: string;
  nodeCount: number;
  extractionStats: {
    highQuality: number;
    mediumQuality: number;
    lowQuality: number;
    totalParametersExtracted: number;
    averageParametersPerNode: number;
  };
  nodes: Record<string, ExtractedNodeSchema>;
  knownIssues: string[];
}

interface ResolvedImport {
  name: string;
  path: string;
  isDefault: boolean;
  isSpread: boolean;
}

class ASTNodeSchemaExtractor {
  private program: ts.Program;
  private checker: ts.TypeChecker;
  private database: NodeSchemaDatabase = {
    generatedAt: new Date().toISOString(),
    nodeCount: 0,
    extractionStats: {
      highQuality: 0,
      mediumQuality: 0,
      lowQuality: 0,
      totalParametersExtracted: 0,
      averageParametersPerNode: 0
    },
    nodes: {},
    knownIssues: []
  };

  constructor() {
    // Initialize TypeScript compiler with appropriate options
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      allowJs: true,
      declaration: false,
      strict: false,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      allowSyntheticDefaultImports: true,
    };

    // Create empty program initially - we'll update it for each file
    this.program = ts.createProgram([], compilerOptions);
    this.checker = this.program.getTypeChecker();
  }

  async extractAllSchemas(): Promise<void> {
    console.log('🔍 Starting AST-based node schema extraction...');
    
    // Find all .node.ts files
    const nodeFiles = await this.findNodeFiles();
    console.log(`📁 Found ${nodeFiles.length} node files`);
    
    // Group files by base node name for version handling
    const nodeFileGroups = this.groupNodeFilesByBaseName(nodeFiles);
    console.log(`📊 Grouped into ${Object.keys(nodeFileGroups).length} unique nodes`);
    
    // Process each node group with version priority
    for (const [baseName, files] of Object.entries(nodeFileGroups)) {
      try {
        await this.processNodeGroupAST(baseName, files);
      } catch (error) {
        console.error(`❌ Failed to process node group ${baseName}:`, error);
        this.database.knownIssues.push(`Failed to process node group ${baseName}: ${error.message}`);
      }
    }
    
    this.generateStats();
    
    console.log(`✅ Extracted schemas for ${this.database.nodeCount} nodes`);
    console.log(`📊 Quality distribution:`, this.database.extractionStats);
  }

  private async findNodeFiles(): Promise<string[]> {
    // Find all .node.ts files in the n8n codebase
    const nodeFiles = await glob('packages/nodes-base/nodes/**/*.node.ts', {
      cwd: process.cwd(),
      absolute: true,
      ignore: ['**/test/**', '**/tests/**', '**/*.test.ts', '**/*.spec.ts']
    });
    
    return nodeFiles;
  }

  private groupNodeFilesByBaseName(files: string[]): Record<string, string[]> {
    const groups: Record<string, string[]> = {};
    
    for (const file of files) {
      const baseName = this.extractBaseNodeName(file);
      if (!groups[baseName]) {
        groups[baseName] = [];
      }
      groups[baseName].push(file);
    }
    
    return groups;
  }

  private extractBaseNodeName(filePath: string): string {
    const fileName = path.basename(filePath, '.node.ts');
    const dirName = path.basename(path.dirname(filePath));
    
    // Remove version suffixes (V1, V2, V3, v1, v2, v3)
    const cleanFileName = fileName.replace(/[Vv]\d+$/, '');
    const cleanDirName = dirName.replace(/[Vv]\d+$/, '');
    
    // Use directory name if filename is generic
    if (cleanFileName === 'index' || cleanFileName.includes('Test')) {
      return cleanDirName.toLowerCase();
    }
    
    return cleanFileName.toLowerCase();
  }

  private async processNodeGroupAST(baseName: string, files: string[]): Promise<void> {
    if (files.length === 1) {
      // Single file - process directly
      await this.processNodeFileAST(files[0]);
    } else {
      // Multiple files - select best version
      const versions: Array<{schema: ExtractedNodeSchema, filePath: string, priority: number}> = [];
      
      for (const file of files) {
        const schema = await this.parseNodeFile(file);
        if (schema) {
          const priority = this.calculateVersionPriority(file, schema);
          versions.push({ schema, filePath: file, priority });
        }
      }
      
      if (versions.length > 0) {
        const bestVersion = this.selectBestVersion(versions);
        
        // Add version selection note
        bestVersion.schema.extractionNotes.push(
          `Selected best version from ${versions.length} candidates (${bestVersion.filePath})`
        );
        
        this.database.nodes[baseName] = bestVersion.schema;
        this.database.nodeCount++;
        this.updateQualityStats(bestVersion.schema);
        
        console.log(`  ✓ Selected best version for ${bestVersion.schema.displayName} (${bestVersion.schema.extractionQuality} quality) from ${versions.length} candidates`);
      }
    }
  }

  private async processNodeFileAST(filePath: string): Promise<void> {
    const schema = await this.parseNodeFile(filePath);
    if (schema) {
      const nodeTypeName = this.extractBaseNodeName(filePath);
      this.database.nodes[nodeTypeName] = schema;
      this.database.nodeCount++;
      this.updateQualityStats(schema);
      
      console.log(`  ✓ Extracted schema for ${schema.displayName} (${schema.extractionQuality} quality)`);
    }
  }

  private calculateVersionPriority(filePath: string, schema: ExtractedNodeSchema): number {
    let priority = 0;
    
    const fileName = path.basename(filePath, '.node.ts');
    const dirName = path.basename(path.dirname(filePath));
    
    // FIXED: Check if this is a wrapper file and penalize it
    const isWrapper = schema.extractionNotes.some(note => note.includes('Wrapper file: VersionedNodeType'));
    if (isWrapper) {
      priority -= 100; // Strong penalty for wrapper files
    }
    
    // ENHANCED: Extract version numbers from multiple patterns
    let versionNum = 0;
    
    // Try file name patterns: PostgresV2, HttpRequestV3, etc.
    const fileVersionMatch = fileName.match(/[Vv](\d+)$/);
    if (fileVersionMatch) {
      versionNum = parseInt(fileVersionMatch[1]);
    }
    
    // Try directory patterns: /v2/, /V3/, /v4/, etc. 
    const dirVersionMatch = dirName.match(/^[Vv](\d+)$/);
    if (dirVersionMatch) {
      versionNum = Math.max(versionNum, parseInt(dirVersionMatch[1]));
    }
    
    // IMPROVED: Higher multiplier for version numbers to prioritize newer versions
    if (versionNum > 0) {
      priority += versionNum * 50; // Increased from 10 to 50
    } else {
      // Files without clear version numbers get moderate priority
      // This handles legacy nodes that don't use versioned naming
      priority += 25;
    }
    
    // Prefer schemas with more parameters (indicates richer extraction)
    priority += schema.parameters.length * 5;
    
    // Prefer higher quality extractions
    switch (schema.extractionQuality) {
      case 'high': priority += 50; break;
      case 'medium': priority += 25; break;
      case 'low': priority += 0; break;
    }
    
    // BONUS: Prefer files in versioned directories (v2+/V2+ structure indicates newer implementations)
    const pathParts = filePath.split(path.sep);
    const hasVersionedDir = pathParts.some(part => part.match(/^[Vv][2-9]$/));
    if (hasVersionedDir) {
      priority += 30;
    }
    
    return priority;
  }

  private selectBestVersion(versions: Array<{schema: ExtractedNodeSchema, filePath: string, priority: number}>): {schema: ExtractedNodeSchema, filePath: string, priority: number} {
    versions.sort((a, b) => b.priority - a.priority);
    return versions[0];
  }

  private updateQualityStats(schema: ExtractedNodeSchema): void {
    switch (schema.extractionQuality) {
      case 'high': this.database.extractionStats.highQuality++; break;
      case 'medium': this.database.extractionStats.mediumQuality++; break;
      case 'low': this.database.extractionStats.lowQuality++; break;
    }
  }

  async parseNodeFile(filePath: string): Promise<ExtractedNodeSchema | null> {
    try {
      const content = readFileSync(filePath, 'utf8');
      
      // Create program for this specific file
      const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.ES2020, true);
      const program = ts.createProgram([filePath], {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        allowJs: true,
        skipLibCheck: true,
        esModuleInterop: true,
      });
      
      this.program = program;
      this.checker = program.getTypeChecker();
      
      // Check if this is a VersionedNodeType wrapper
      const wrapperInfo = this.detectVersionedNodeWrapper(sourceFile);
      
      if (wrapperInfo.isWrapper && wrapperInfo.defaultVersion) {
        // This is a wrapper file - find the actual implementation
        const implementationFile = this.findImplementationFileForVersion(filePath, wrapperInfo.defaultVersion);
        
        if (implementationFile) {
          console.log(`  ℹ️  Detected wrapper ${path.basename(filePath)} (defaultVersion: ${wrapperInfo.defaultVersion}) -> redirecting to ${path.basename(implementationFile)}`);
          
          // Parse the implementation file instead
          return await this.parseNodeFile(implementationFile);
        } else {
          console.log(`  ⚠️  Wrapper ${path.basename(filePath)} found but couldn't locate implementation for version ${wrapperInfo.defaultVersion}`);
          // Fall back to parsing the wrapper itself, but mark it appropriately
        }
      }
      
      // Extract node schema using AST (either from wrapper fallback or non-wrapper file)
      const nodeSchema = await this.extractNodeSchemaAST(sourceFile, filePath);
      
      // Mark wrapper files in extraction notes
      if (wrapperInfo.isWrapper && nodeSchema) {
        nodeSchema.extractionNotes.push(`Wrapper file: VersionedNodeType with defaultVersion ${wrapperInfo.defaultVersion || 'unspecified'}`);
      }
      
      return nodeSchema;
    } catch (error) {
      console.error(`❌ Error processing ${filePath}:`, error);
      this.database.knownIssues.push(`Error processing ${filePath}: ${error.message}`);
      return null;
    }
  }

  private async extractNodeSchemaAST(sourceFile: ts.SourceFile, filePath: string): Promise<ExtractedNodeSchema | null> {
    const extractionNotes: string[] = [];
    
    // Find the node type description
    const description = await this.findNodeDescription(sourceFile, filePath, extractionNotes);
    if (!description) {
      return null;
    }
    
    // Extract properties using AST
    const parameters = await this.extractPropertiesAST(sourceFile, filePath, extractionNotes);
    
    // Determine extraction quality
    const quality = this.determineExtractionQuality(parameters, extractionNotes);
    
    return {
      displayName: description.displayName || 'Unknown',
      name: description.name || 'unknown',
      description: description.description,
      group: description.group,
      version: description.version || 1,
      icon: description.icon,
      parameters,
      credentials: description.credentials,
      webhookId: description.webhookId,
      polling: description.polling,
      supportsCORS: description.supportsCORS,
      extractionQuality: quality,
      extractionNotes
    };
  }

  private async findNodeDescription(sourceFile: ts.SourceFile, filePath: string, extractionNotes: string[]): Promise<any> {
    const description: any = {};
    
    // Visit all nodes in the AST
    const visit = (node: ts.Node) => {
      // Look for variable declarations like: const versionDescription = { ... }
      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer)) {
            const variableName = declaration.name && ts.isIdentifier(declaration.name) ? declaration.name.text : '';
            if (variableName.includes('description') || variableName.includes('Description')) {
              this.extractDescriptionFromObjectLiteral(declaration.initializer, description, extractionNotes);
              extractionNotes.push(`Found description via variable: ${variableName}`);
            }
          }
        }
      }
      
      // Look for class property assignments like: description = { ... }
      if (ts.isPropertyAssignment(node) && node.name && ts.isIdentifier(node.name)) {
        const propName = node.name.text;
        if (propName === 'description' && ts.isObjectLiteralExpression(node.initializer)) {
          this.extractDescriptionFromObjectLiteral(node.initializer, description, extractionNotes);
          extractionNotes.push('Found description via class property');
        }
      }
      
      // Look for INodeTypeDescription interface implementations
      if (ts.isInterfaceDeclaration(node) && node.name.text === 'INodeTypeDescription') {
        // This is a type definition, not useful for extraction
        return;
      }
      
      ts.forEachChild(node, visit);
    };
    
    visit(sourceFile);
    
    // Fallback: try to extract basic info from filename if no description found
    if (!description.displayName) {
      const fileName = path.basename(filePath, '.node.ts');
      const dirName = path.basename(path.dirname(filePath));
      
      // Use directory name as display name if it's more descriptive
      if (dirName !== 'nodes' && dirName !== 'base' && !fileName.includes('Test')) {
        description.displayName = this.formatDisplayName(dirName);
        description.name = dirName.toLowerCase();
        extractionNotes.push(`Inferred name from directory: ${dirName}`);
      } else if (fileName !== 'index') {
        description.displayName = this.formatDisplayName(fileName);
        description.name = fileName.toLowerCase();
        extractionNotes.push(`Inferred name from filename: ${fileName}`);
      }
    }
    
    return Object.keys(description).length > 0 ? description : null;
  }

  private formatDisplayName(name: string): string {
    // Convert camelCase/PascalCase to Title Case
    return name
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, str => str.toUpperCase())
      .replace(/v\d+$/i, '') // Remove version suffixes
      .trim();
  }

  private extractDescriptionFromObjectLiteral(obj: ts.ObjectLiteralExpression, description: any, extractionNotes: string[]): void {
    for (const prop of obj.properties) {
      if (ts.isPropertyAssignment(prop) && prop.name && ts.isIdentifier(prop.name)) {
        const propName = prop.name.text;
        const value = this.extractValueFromNode(prop.initializer);
        
        if (value !== undefined) {
          description[propName] = value;
        }
      }
    }
  }

  private extractValueFromNode(node: ts.Node): any {
    if (ts.isStringLiteral(node)) {
      return node.text;
    }
    if (ts.isNumericLiteral(node)) {
      return parseInt(node.text, 10);
    }
    if (node.kind === ts.SyntaxKind.TrueKeyword) {
      return true;
    }
    if (node.kind === ts.SyntaxKind.FalseKeyword) {
      return false;
    }
    if (ts.isArrayLiteralExpression(node)) {
      return node.elements.map(el => this.extractValueFromNode(el)).filter(v => v !== undefined);
    }
    // ENHANCED: Handle object literals for nested structures like displayOptions
    if (ts.isObjectLiteralExpression(node)) {
      const obj: any = {};
      for (const prop of node.properties) {
        if (ts.isPropertyAssignment(prop) && prop.name && ts.isIdentifier(prop.name)) {
          const propName = prop.name.text;
          const value = this.extractValueFromNode(prop.initializer);
          if (value !== undefined) {
            obj[propName] = value;
          }
        }
      }
      return Object.keys(obj).length > 0 ? obj : undefined;
    }
    return undefined;
  }

  private async extractPropertiesAST(sourceFile: ts.SourceFile, filePath: string, extractionNotes: string[]): Promise<ExtractedParameterSchema[]> {
    const parameters: ExtractedParameterSchema[] = [];
    
    // First, look for direct properties array
    const directProperties = this.findDirectProperties(sourceFile);
    if (directProperties.length > 0) {
      parameters.push(...directProperties);
      extractionNotes.push(`Found ${directProperties.length} direct properties`);
    }
    
    // Then, look for spread properties and imports
    const importedProperties = await this.resolveImportedProperties(sourceFile, filePath, extractionNotes);
    parameters.push(...importedProperties);
    
    // ENHANCED: Expand conditional parameters based on displayOptions
    const expandedParameters = this.expandConditionalParameters(parameters, extractionNotes);
    
    this.database.extractionStats.totalParametersExtracted += expandedParameters.length;
    
    return expandedParameters;
  }

  private expandConditionalParameters(parameters: ExtractedParameterSchema[], extractionNotes: string[]): ExtractedParameterSchema[] {
    const expandedParameters: ExtractedParameterSchema[] = [...parameters];
    let conditionalCount = 0;

    // Find parameters with displayOptions that create conditional visibility
    for (const param of parameters) {
      if (param.displayOptions?.show) {
        const showConditions = param.displayOptions.show;
        
        // For each show condition, create virtual parameters to represent the conditional state
        for (const [conditionKey, conditionValues] of Object.entries(showConditions)) {
          if (Array.isArray(conditionValues)) {
            for (const value of conditionValues) {
              // Create a conditional variant of this parameter
              const conditionalParam: ExtractedParameterSchema = {
                ...param,
                name: `${param.name}_when_${conditionKey}_${value}`,
                displayName: `${param.displayName} (when ${conditionKey}=${value})`,
                exampleValue: param.exampleValue,
                workflowJsonStructure: {
                  ...param.workflowJsonStructure,
                  parameterName: param.name, // Keep original name for workflow JSON
                  conditionalContext: {
                    condition: conditionKey,
                    value: value,
                    description: `Only visible when ${conditionKey} is set to ${value}`
                  }
                }
              };
              
              expandedParameters.push(conditionalParam);
              conditionalCount++;
            }
          }
        }
      }
    }

    if (conditionalCount > 0) {
      extractionNotes.push(`🔀 Expanded ${conditionalCount} conditional parameters from displayOptions.show`);
    }

    return expandedParameters;
  }

  private findDirectProperties(sourceFile: ts.SourceFile): ExtractedParameterSchema[] {
    const properties: ExtractedParameterSchema[] = [];
    
    const visit = (node: ts.Node) => {
      // Look for properties: [...] arrays in object literals
      if (ts.isPropertyAssignment(node) && 
          node.name && 
          ts.isIdentifier(node.name) && 
          node.name.text === 'properties' &&
          ts.isArrayLiteralExpression(node.initializer)) {
        
        for (const element of node.initializer.elements) {
          if (ts.isObjectLiteralExpression(element)) {
            const param = this.parsePropertyObject(element);
            if (param) {
              properties.push(param);
            }
          }
        }
      }
      
      // Also look for export const description: INodeProperties[]
      if (ts.isVariableStatement(node) && 
          node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        
        for (const declaration of node.declarationList.declarations) {
          if (declaration.name && 
              ts.isIdentifier(declaration.name) && 
              declaration.name.text === 'description' &&
              declaration.initializer &&
              ts.isArrayLiteralExpression(declaration.initializer)) {
            
            for (const element of declaration.initializer.elements) {
              if (ts.isObjectLiteralExpression(element)) {
                const param = this.parsePropertyObject(element);
                if (param) {
                  properties.push(param);
                }
              }
            }
          }
        }
      }
      
      ts.forEachChild(node, visit);
    };
    
    visit(sourceFile);
    
    return properties;
  }

  private parsePropertyObject(obj: ts.ObjectLiteralExpression): ExtractedParameterSchema | null {
    const param: any = {};
    
    for (const prop of obj.properties) {
      if (ts.isPropertyAssignment(prop) && prop.name && ts.isIdentifier(prop.name)) {
        const propName = prop.name.text;
        const value = this.extractValueFromNode(prop.initializer);
        
        if (value !== undefined) {
          param[propName] = value;
        }
      }
    }
    
    if (param.name && param.type) {
      return {
        name: param.name,
        displayName: param.displayName || param.name,
        type: param.type,
        default: param.default,
        description: param.description,
        required: param.required,
        placeholder: param.placeholder,
        hint: param.hint,
        options: param.options,
        displayOptions: param.displayOptions,
        typeOptions: param.typeOptions,
        routing: param.routing,
        modes: param.modes,
        extractValue: param.extractValue,
        nested: param.nested,
        exampleValue: param.exampleValue || param.default,
        workflowJsonStructure: {
          parameterName: param.name,
          workflowJsonValue: param.exampleValue || param.default,
          usage: `"${param.name}": ${JSON.stringify(param.exampleValue || param.default)}`,
          type: param.type,
          required: param.required || false
        }
      };
    }
    
    return null;
  }

  private async resolveImportedProperties(sourceFile: ts.SourceFile, filePath: string, extractionNotes: string[]): Promise<ExtractedParameterSchema[]> {
    const properties: ExtractedParameterSchema[] = [];
    
    // Check if this is a v2+ node structure first
    const isV2Node = this.detectV2Structure(filePath);
    
    if (isV2Node) {
      // Handle v2+ node structure with resource files
      const v2Properties = await this.handleV2NodeStructure(filePath, extractionNotes);
      properties.push(...v2Properties);
    } else {
      // Handle traditional spread imports
      const spreadImports = this.findSpreadImports(sourceFile);
      
      for (const spreadImport of spreadImports) {
        const resolvedProperties = await this.resolveSpreadImport(spreadImport, filePath, extractionNotes);
        properties.push(...resolvedProperties);
      }
    }
    
    return properties;
  }

  private detectV2Structure(filePath: string): boolean {
    // Check if this is a v2+ node by looking for version directory structure
    const pathParts = filePath.split(path.sep);
    const fileName = path.basename(filePath, '.node.ts');
    
    // Check for versioned directories: v2, v3, V2, V3, V4, etc.
    const hasVersionedDir = pathParts.some(part => part.match(/^[Vv][2-9]$/) || part.match(/^[Vv]\d{2,}$/));
    
    // Check for actions directory (indicates v2+ structure)
    const hasActionsDir = pathParts.some(part => part === 'actions');
    
    // Check for versioned file names: PostgresV2, HttpRequestV3, etc.
    const hasVersionedFileName = fileName.match(/[Vv][2-9]$/) || fileName.match(/[Vv]\d{2,}$/);
    
    // Check for multi-digit versions like V10, V11, etc.
    const hasHighVersionDir = pathParts.some(part => part.match(/^[Vv]\d{2,}$/));
    const hasHighVersionFile = fileName.match(/[Vv]\d{2,}$/);
    
    return hasVersionedDir || hasActionsDir || hasVersionedFileName || hasHighVersionDir || hasHighVersionFile;
  }

  private detectVersionedNodeWrapper(sourceFile: ts.SourceFile): { isWrapper: boolean, defaultVersion?: number } {
    let isWrapper = false;
    let defaultVersion: number | undefined;

    const visit = (node: ts.Node) => {
      // Look for class declarations that extend VersionedNodeType
      if (ts.isClassDeclaration(node)) {
        const heritage = node.heritageClauses;
        if (heritage) {
          for (const clause of heritage) {
            if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
              for (const type of clause.types) {
                if (ts.isIdentifier(type.expression) && type.expression.text === 'VersionedNodeType') {
                  isWrapper = true;
                }
              }
            }
          }
        }
      }

      // Look for defaultVersion assignment in object literals
      if (ts.isPropertyAssignment(node) && node.name && ts.isIdentifier(node.name)) {
        if (node.name.text === 'defaultVersion' && ts.isNumericLiteral(node.initializer)) {
          defaultVersion = parseFloat(node.initializer.text);
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return { isWrapper, defaultVersion };
  }

  private findImplementationFileForVersion(wrapperFilePath: string, version: number): string | null {
    const nodeDir = path.dirname(wrapperFilePath);
    const baseName = path.basename(wrapperFilePath, '.node.ts');
    
    // Special mapping logic for nodes with non-linear version progression
    let targetVersion = Math.floor(version);
    
    // HTTP Request: versions 4+ use V3 implementation
    if (baseName === 'HttpRequest' && version >= 4) {
      targetVersion = 3;
    }
    
    // Google Sheets: versions 4+ use V2 implementation  
    if (baseName === 'GoogleSheets' && version >= 3) {
      targetVersion = 2;
    }
    
    // Google Drive: versions 3+ use V3 implementation
    if (baseName === 'GoogleDrive' && version >= 3) {
      targetVersion = 3;
    }
    
    // Common version patterns to try
    const versionPatterns = [
      `V${targetVersion}`, // V2, V3, V4
      `v${targetVersion}`, // v2, v3, v4  
      `${baseName}V${targetVersion}` // PostgresV2, HttpRequestV3
    ];

    for (const pattern of versionPatterns) {
      // Try subdirectory pattern: /V2/HttpRequestV2.node.ts
      const subDirPath = path.join(nodeDir, pattern, `${baseName}${pattern}.node.ts`);
      if (existsSync(subDirPath)) {
        return subDirPath;
      }

      // Try direct pattern: /v2/PostgresV2.node.ts  
      const directPath = path.join(nodeDir, pattern.toLowerCase(), `${baseName}${pattern}.node.ts`);
      if (existsSync(directPath)) {
        return directPath;
      }
    }

    // Fallback: look for any versioned file in subdirectories
    try {
      const entries = readdirSync(nodeDir);
      for (const entry of entries) {
        if (entry.match(/^[Vv]\d+$/)) {
          const versionDir = path.join(nodeDir, entry);
          const files = readdirSync(versionDir);
          const nodeFile = files.find(f => f.endsWith('.node.ts') && f.includes(baseName));
          if (nodeFile) {
            return path.join(versionDir, nodeFile);
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
    }

    return null;
  }

  private async handleV2NodeStructure(filePath: string, extractionNotes: string[]): Promise<ExtractedParameterSchema[]> {
    const properties: ExtractedParameterSchema[] = [];
    
    // Try to find the actions directory
    const nodeDir = path.dirname(filePath);
    const actionsDir = path.join(nodeDir, 'actions');
    
    if (existsSync(actionsDir)) {
      extractionNotes.push('Detected v2+ node structure with actions directory');
      
      // Look for resource files
      const resourceFiles = await this.findResourceFiles(actionsDir);
      
      for (const resourceFile of resourceFiles) {
        const resourceProperties = await this.parseResourceFile(resourceFile, extractionNotes);
        properties.push(...resourceProperties);
      }
      
      // Also look for operation files
      const operationFiles = await this.findOperationFiles(actionsDir);
      
      for (const operationFile of operationFiles) {
        const operationProperties = await this.parseOperationFile(operationFile, extractionNotes);
        properties.push(...operationProperties);
      }
    } else {
      // Fall back to regular spread import handling
      const sourceFile = ts.createSourceFile(filePath, readFileSync(filePath, 'utf8'), ts.ScriptTarget.ES2020, true);
      const spreadImports = this.findSpreadImports(sourceFile);
      
      for (const spreadImport of spreadImports) {
        const resolvedProperties = await this.resolveSpreadImport(spreadImport, filePath, extractionNotes);
        properties.push(...resolvedProperties);
      }
    }
    
    // Also try to parse versionDescription.ts if it exists
    const versionDescFile = path.join(path.dirname(filePath), 'actions', 'versionDescription.ts');
    if (existsSync(versionDescFile)) {
      const versionProperties = await this.parseVersionDescription(versionDescFile, extractionNotes);
      properties.push(...versionProperties);
    }
    
    return properties;
  }

  private async findResourceFiles(actionsDir: string): Promise<string[]> {
    try {
      // Look for resource files in root actions directory and subdirectories
      const files = await glob('**/*.resource.ts', { cwd: actionsDir, absolute: true });
      return files;
    } catch (error) {
      return [];
    }
  }

  private async findOperationFiles(actionsDir: string): Promise<string[]> {
    try {
      const files = await glob('**/*.operation.ts', { cwd: actionsDir, absolute: true });
      return files;
    } catch (error) {
      return [];
    }
  }

  private async parseResourceFile(resourceFilePath: string, extractionNotes: string[]): Promise<ExtractedParameterSchema[]> {
    const properties: ExtractedParameterSchema[] = [];
    
    try {
      const content = readFileSync(resourceFilePath, 'utf8');
      const sourceFile = ts.createSourceFile(resourceFilePath, content, ts.ScriptTarget.ES2020, true);
      
      // Look for exported description arrays
      const directProperties = this.findDirectProperties(sourceFile);
      if (directProperties.length > 0) {
        properties.push(...directProperties);
        extractionNotes.push(`🔗 Found ${directProperties.length} properties in resource file ${path.basename(resourceFilePath)}`);
      }
      
      // Also look for operation imports and resolve them
      const operationImports = this.findOperationImports(sourceFile);
      for (const operationImport of operationImports) {
        const operationPath = this.resolveImportPath(operationImport.path, resourceFilePath);
        if (existsSync(operationPath)) {
          const operationProperties = await this.parseOperationFile(operationPath, extractionNotes);
          properties.push(...operationProperties);
        }
      }
      
    } catch (error) {
      extractionNotes.push(`Failed to parse resource file ${resourceFilePath}: ${error.message}`);
    }
    
    return properties;
  }

  private async parseOperationFile(operationFilePath: string, extractionNotes: string[]): Promise<ExtractedParameterSchema[]> {
    const properties: ExtractedParameterSchema[] = [];
    
    try {
      const content = readFileSync(operationFilePath, 'utf8');
      const sourceFile = ts.createSourceFile(operationFilePath, content, ts.ScriptTarget.ES2020, true);
      
      // Look for exported properties or description arrays
      const directProperties = this.findDirectProperties(sourceFile);
      if (directProperties.length > 0) {
        properties.push(...directProperties);
        extractionNotes.push(`🔗 Found ${directProperties.length} properties in operation file ${path.basename(operationFilePath)}`);
      }
      
      // Also look for exported constants that might contain properties
      const exportedConstants = this.findExportedConstants(sourceFile);
      for (const constant of exportedConstants) {
        if (constant.type === 'array' && constant.name.includes('properties')) {
          properties.push(...constant.properties);
          extractionNotes.push(`🔗 Found ${constant.properties.length} properties from exported constant ${constant.name}`);
        }
      }
      
    } catch (error) {
      extractionNotes.push(`Failed to parse operation file ${operationFilePath}: ${error.message}`);
    }
    
    return properties;
  }

  private findOperationImports(sourceFile: ts.SourceFile): Array<{name: string, path: string}> {
    const imports: Array<{name: string, path: string}> = [];
    
    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement) && statement.importClause) {
        const importClause = statement.importClause;
        const moduleSpecifier = (statement.moduleSpecifier as ts.StringLiteral).text;
        
        // Look for operation imports (usually end with .operation)
        if (moduleSpecifier.includes('.operation')) {
          if (importClause.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
            for (const element of importClause.namedBindings.elements) {
              imports.push({
                name: element.name.text,
                path: moduleSpecifier
              });
            }
          }
        }
      }
    }
    
    return imports;
  }

  private findExportedConstants(sourceFile: ts.SourceFile): Array<{name: string, type: string, properties: ExtractedParameterSchema[]}> {
    const constants: Array<{name: string, type: string, properties: ExtractedParameterSchema[]}> = [];
    
    const visit = (node: ts.Node) => {
      if (ts.isVariableStatement(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        for (const declaration of node.declarationList.declarations) {
          if (declaration.name && ts.isIdentifier(declaration.name) && declaration.initializer) {
            const name = declaration.name.text;
            
            if (ts.isArrayLiteralExpression(declaration.initializer)) {
              const properties: ExtractedParameterSchema[] = [];
              
              for (const element of declaration.initializer.elements) {
                if (ts.isObjectLiteralExpression(element)) {
                  const param = this.parsePropertyObject(element);
                  if (param) {
                    properties.push(param);
                  }
                }
              }
              
              constants.push({
                name,
                type: 'array',
                properties
              });
            }
          }
        }
      }
      
      ts.forEachChild(node, visit);
    };
    
    visit(sourceFile);
    
    return constants;
  }

  private async parseVersionDescription(versionDescFile: string, extractionNotes: string[]): Promise<ExtractedParameterSchema[]> {
    const properties: ExtractedParameterSchema[] = [];
    
    try {
      const content = readFileSync(versionDescFile, 'utf8');
      const sourceFile = ts.createSourceFile(versionDescFile, content, ts.ScriptTarget.ES2020, true);
      
      // Look for spread imports in the properties array
      const spreadImports = this.findSpreadImports(sourceFile);
      
      for (const spreadImport of spreadImports) {
        const resolvedProperties = await this.resolveSpreadImport(spreadImport, versionDescFile, extractionNotes);
        properties.push(...resolvedProperties);
      }
      
      if (properties.length > 0) {
        extractionNotes.push(`🔗 Resolved ${properties.length} properties from versionDescription.ts`);
      }
      
    } catch (error) {
      extractionNotes.push(`Failed to parse versionDescription.ts: ${error.message}`);
    }
    
    return properties;
  }

  private findSpreadImports(sourceFile: ts.SourceFile): Array<{name: string, path: string}> {
    const imports: Array<{name: string, path: string}> = [];
    
    const visit = (node: ts.Node) => {
      // Look for spread elements like ...database.description
      if (ts.isSpreadElement(node) && 
          ts.isPropertyAccessExpression(node.expression)) {
        
        const expression = node.expression;
        if (ts.isIdentifier(expression.expression)) {
          const importName = expression.expression.text;
          const propertyName = expression.name.text;
          
          // Find the import for this identifier
          const importPath = this.findImportPath(sourceFile, importName);
          if (importPath) {
            imports.push({
              name: `${importName}.${propertyName}`,
              path: importPath
            });
          }
        }
      }
      
      ts.forEachChild(node, visit);
    };
    
    visit(sourceFile);
    
    return imports;
  }

  private findImportPath(sourceFile: ts.SourceFile, importName: string): string | null {
    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement) && statement.importClause) {
        const importClause = statement.importClause;
        
        // Check named imports (import { foo } from ...)
        if (importClause.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
          for (const element of importClause.namedBindings.elements) {
            if (element.name.text === importName) {
              return (statement.moduleSpecifier as ts.StringLiteral).text;
            }
          }
        }
        
        // Check namespace imports (import * as database from ...)
        if (importClause.namedBindings && ts.isNamespaceImport(importClause.namedBindings)) {
          if (importClause.namedBindings.name.text === importName) {
            return (statement.moduleSpecifier as ts.StringLiteral).text;
          }
        }
        
        // Check default imports (import database from ...)
        if (importClause.name && importClause.name.text === importName) {
          return (statement.moduleSpecifier as ts.StringLiteral).text;
        }
      }
    }
    
    return null;
  }

  private async resolveSpreadImport(spreadImport: {name: string, path: string}, filePath: string, extractionNotes: string[]): Promise<ExtractedParameterSchema[]> {
    try {
      // Resolve the import path
      const resolvedPath = this.resolveImportPath(spreadImport.path, filePath);
      
      if (!existsSync(resolvedPath)) {
        extractionNotes.push(`Could not resolve import: ${spreadImport.path}`);
        return [];
      }
      
      // Parse the imported file
      const importedContent = readFileSync(resolvedPath, 'utf8');
      const importedSourceFile = ts.createSourceFile(resolvedPath, importedContent, ts.ScriptTarget.ES2020, true);
      
      // Extract properties from the imported file
      const properties = this.findDirectProperties(importedSourceFile);
      
      if (properties.length > 0) {
        extractionNotes.push(`🔗 Resolved ${properties.length} properties from ${spreadImport.path}`);
      }
      
      return properties;
    } catch (error) {
      extractionNotes.push(`Failed to resolve import ${spreadImport.path}: ${error.message}`);
      return [];
    }
  }

  private resolveImportPath(importPath: string, currentFilePath: string): string {
    const currentDir = path.dirname(currentFilePath);
    
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      // Relative import
      let resolvedPath = path.resolve(currentDir, importPath);
      
      // Try different extensions
      const extensions = ['.ts', '.js', '.json'];
      for (const ext of extensions) {
        const withExt = resolvedPath + ext;
        if (existsSync(withExt)) {
          return withExt;
        }
      }
      
      // Try index files
      for (const ext of extensions) {
        const indexFile = path.join(resolvedPath, `index${ext}`);
        if (existsSync(indexFile)) {
          return indexFile;
        }
      }
    }
    
    return importPath;
  }

  private determineExtractionQuality(parameters: ExtractedParameterSchema[], extractionNotes: string[]): 'high' | 'medium' | 'low' {
    const paramCount = parameters.length;
    const hasTypes = parameters.every(p => p.type);
    const hasDescriptions = parameters.filter(p => p.description).length > paramCount / 2;
    
    if (paramCount >= 5 && hasTypes && hasDescriptions) {
      return 'high';
    } else if (paramCount >= 2 && hasTypes) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private generateStats(): void {
    const stats = this.database.extractionStats;
    stats.averageParametersPerNode = this.database.nodeCount > 0 
      ? stats.totalParametersExtracted / this.database.nodeCount 
      : 0;
  }

  async saveResults(): Promise<void> {
    // Ensure _ignored directory exists
    const ignoredDir = path.join(process.cwd(), '_ignored');
    if (!existsSync(ignoredDir)) {
      throw new Error('_ignored directory does not exist. Please create it first.');
    }
    
    // Save full database
    const fullDatabasePath = path.join(ignoredDir, 'node-schemas-ast.json');
    writeFileSync(fullDatabasePath, JSON.stringify(this.database, null, 2));
    
    // Save high-quality nodes only for RAG
    const highQualityNodes = Object.fromEntries(
      Object.entries(this.database.nodes).filter(([_, node]) => 
        node.extractionQuality === 'high' || node.extractionQuality === 'medium'
      )
    );
    
    const ragOptimizedPath = path.join(ignoredDir, 'node-schemas-ast-rag-optimized.json');
    writeFileSync(ragOptimizedPath, JSON.stringify({
      ...this.database,
      nodes: highQualityNodes,
      nodeCount: Object.keys(highQualityNodes).length
    }, null, 2));
    
    console.log('💾 Saved AST-based schema database to', fullDatabasePath);
    console.log('📦 Saved RAG-optimized schema database to', ragOptimizedPath);
  }
}

// Main execution
async function main() {
  const extractor = new ASTNodeSchemaExtractor();
  
  try {
    await extractor.extractAllSchemas();
    await extractor.saveResults();
    console.log('🎉 AST-based schema extraction completed successfully!');
  } catch (error) {
    console.error('❌ Fatal error during extraction:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}