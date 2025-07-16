# N8N Node Schema Extraction

This document describes the AST-based node schema extraction system for n8n workflow nodes.

## Overview

The extraction system uses TypeScript AST parsing to extract comprehensive parameter schemas from n8n nodes, with special handling for modern v2+ node architectures.

## Quick Start

```bash
# Run the extraction
pnpx tsx extract-node-schemas-ast.ts

# Results will be saved to:
# - _ignored/node-schemas-ast.json (full database)
# - _ignored/node-schemas-ast-rag-optimized.json (high-quality nodes only)
```

## Key Improvements

### Before (Regex-based extraction):
- **PostgresV2**: 0 parameters extracted
- **Overall quality**: 82% (428/518 nodes)
- **Failed on**: All v2+ nodes with complex architectures

### After (AST-based extraction):
- **PostgresV2**: 9 parameters extracted ✅
- **Expected quality**: 90%+ 
- **Handles**: Complex v2+ node architectures, namespace imports, spread operators

## Technical Architecture

### Core Components

1. **ASTNodeSchemaExtractor**: Main extraction class
2. **TypeScript Compiler Integration**: Proper AST parsing
3. **V2+ Node Handler**: Handles complex resource structures
4. **Import Resolution System**: Follows import chains and spread operators

### V2+ Node Support

The extractor handles modern n8n node architectures:

```typescript
// versionDescription.ts
properties: [
  ...database.description,  // ← Spread import
]

// Database.resource.ts  
export const description: INodeProperties[] = [
  // ← Exported constant
]
```

### Version Selection

Automatically selects the best version of nodes:

```typescript
Priority = (version * 10) + (paramCount * 5) + qualityBonus
```

- **V3 > V2 > V1**: Higher versions preferred
- **More parameters**: Better coverage preferred
- **Higher quality**: Better extraction preferred

## File Structure

```
extract-node-schemas-ast.ts    # Main extraction script
_ignored/                      # Output directory (gitignored)
├── node-schemas-ast.json      # Full database
└── node-schemas-ast-rag-optimized.json  # High-quality nodes only
```

## Example Success Case: PostgresV2

```
📁 PostgresV2.node.ts
├── 📁 actions/
│   ├── 📄 versionDescription.ts      # Contains: ...database.description
│   └── 📁 database/
│       ├── 📄 Database.resource.ts   # Contains: export const description
│       └── 📁 operations/
│           ├── 📄 insert.operation.ts
│           ├── 📄 select.operation.ts
│           └── 📄 update.operation.ts
```

**Result**: 9 parameters extracted (vs 0 with regex approach)

## Performance

- **Speed**: ~2-3 minutes for full extraction
- **Accuracy**: Significantly improved for v2+ nodes
- **Trade-off**: Slower but much more accurate than regex approach

## Usage in RAG System

The extracted schemas provide comprehensive parameter information for:
- **Workflow building**: Parameter names, types, descriptions
- **Code generation**: Proper parameter structures
- **Documentation**: Complete node capabilities

## Maintenance

The extraction system automatically handles:
- **Version management**: Selects best versions
- **Quality assessment**: Rates extraction completeness
- **Error handling**: Graceful degradation for problematic nodes

## Future Improvements

- **Conditional property extraction**: Handle displayOptions.show/hide
- **Performance optimization**: Reduce TypeScript compilation overhead
- **Operation-specific parameters**: Extract parameters per operation type