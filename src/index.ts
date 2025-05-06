#!/usr/bin/env node

import { promises as fs, existsSync } from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

interface AptosResource {
    type: string;
    data?: {
      allow_ungated_transfer?: boolean;
      guid_creation_num?: string;
      owner?: string;
      transfer_events?: any;
      extend_ref?: any;
      packages?: PackageInfo[];
      [key: string]: any;
    };
}

interface PackageDep {
    account: string;
    package_name: string;
}

interface PackageModule {
    extension: {
      vec: any[];
    };
    name: string;
    source: string;
    source_map: string;
}

interface PackageInfo {
    deps: PackageDep[]; 
    extension: {
      vec: any[];
    };
    manifest: string;
    modules: PackageModule[]; 
    name: string;
    source_digest: string;
    upgrade_number: string;
    upgrade_policy: {
      policy: number;
    };
  }

interface Response {
    bytecode: string;
    abi: ModuleAbi;
}

interface ModuleAbi {
    address: string;
    name: string;
    friends: string[];
    exposed_functions: AptosFunction[];
    structs: AptosStruct[];
}

interface AptosFunction {
    name: string;
    visibility: string;
    is_entry: boolean;
    is_view: boolean;
    generic_type_params: [{ constraints: [] }][];
    params: string[];
    return: string[];
}

interface AptosStruct {
    name: string;
    is_native: boolean;
    is_event: boolean;
    abilities: string[];
    generic_type_params: any[];
    fields: {
        name: string;
        type: string;
    }[];
}

function aptosStructToMove(struct: AptosStruct): string {
    const abilities = struct.abilities.length > 0 ? ` has ${struct.abilities.join(', ')}` : '';
    const generics = struct.generic_type_params.length > 0 ? `<${struct.generic_type_params.map((_, i) => `T${i}`).join(', ')}>` : '';
    const fields = struct.fields
        .filter(f => f.name !== 'dummy_field')
        .map(f => `    ${f.name}: ${f.type},`)
        .join('\n');
    return `struct ${struct.name}${generics}${abilities} {\n${fields}\n}`;
}

function aptosFunctionToMove(fn: AptosFunction): string {
    const entry = fn.is_entry ? 'entry ' : '';
    const visibility = fn.visibility === 'public' ? 'public ' : '';
    const generics = fn.generic_type_params.length > 0
        ? `<${fn.generic_type_params.map((_, i) => `T${i}`).join(', ')}>`
        : '';
    const params = fn.params.map((p, i) => `arg${i}: ${p}`).join(', ');
    const returns = fn.return.length > 0 ? `: (${fn.return.join(', ')})` : '';
    return `native ${entry}${visibility}fun ${fn.name}${generics}(${params})${returns} ;`;
}

// Function to get bearer token from environment or command line
function getBearerToken(): string {
    return process.env.APTOS_API_TOKEN || '';
}

// Function to create headers with Bearer token when available
function createHeaders(): HeadersInit {
    const token = getBearerToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function get_module_abi(rpc: string, account: string, module: string): Promise<Response> {
    const headers = createHeaders();
    const response = await fetch(`${rpc}/v1/accounts/${account}/module/${module}`, { headers });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const jsonData: Response = await response.json();
    return jsonData;
}

// New function to collect all dependencies recursively
async function collectAllDependencies(
  rpc: string, 
  account: string, 
  packageName: string, 
  depsMap: Map<string, {account: string, packageName: string}> = new Map()
): Promise<Map<string, {account: string, packageName: string}>> {
  try {
    // Get account resources with Bearer token
    const headers = createHeaders();
    const response = await fetch(`${rpc}/v1/accounts/${account}/resources`, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const jsonData: AptosResource[] = await response.json();

    // Find package registry
    const packageRegistry = jsonData.find(item => item.type === '0x1::code::PackageRegistry');
    if (!packageRegistry || !packageRegistry.data?.packages) {
      return depsMap;
    }

    // Find target package
    let targetPackage = packageRegistry.data.packages.find(pkg => pkg.name === packageName);
    if (!targetPackage) {
      return depsMap;
    }

    // Process dependencies
    for (const dep of targetPackage.deps) {
      if (!["0x1","0x3","0x4"].includes(dep.account)) {
        const depKey = `${dep.account}::${dep.package_name}`;
        if (!depsMap.has(depKey)) {
          depsMap.set(depKey, {account: dep.account, packageName: dep.package_name});
          // Recursively collect dependencies of this dependency
          await collectAllDependencies(rpc, dep.account, dep.package_name, depsMap);
        }
      }
    }
    return depsMap;
  } catch (error) {
    console.error(`Error collecting dependencies for ${packageName}:`, error instanceof Error ? error.message : error);
    return depsMap;
  }
}

async function generateMoveToml(packageName: string, account: string, targetPackage: PackageInfo, isRoot: boolean = false): Promise<string> {
    const uniquePackageName = `${packageName}_${account.replace(/^0x/, '')}`;
    const deps = targetPackage.deps.map((dep) => {
        const depUniqueName = `${dep.package_name}_${dep.account.replace(/^0x/, '')}`;
        if (["0x1", "0x3", "0x4"].includes(dep.account)) {
            let subdir = "aptos-framework";
            if (dep.package_name === "AptosStdlib") { 
                subdir = "aptos-stdlib";
            } else if (dep.package_name === "AptosFramework") {
                subdir = "aptos-framework";
            } else if (dep.package_name === "AptosTokenObjects") {
                subdir = "aptos-token-objects";
            } else if (dep.package_name === "AptosToken") {
                subdir = "aptos-token";
            } else if (dep.package_name === "MoveStdlib") {
                subdir = "move-stdlib";
            }
            return `${dep.package_name} = { git = "https://github.com/aptos-labs/aptos-framework.git", rev = "mainnet", subdir = "${subdir}"}`;
        } else {
            if (isRoot) {
                return `${dep.package_name} = { local = "deps/${depUniqueName}" }`;
            } else {
                return `${dep.package_name} = { local = "../${depUniqueName}" }`;
            }
        }
    }).join('\n');

    return `[package]\nname = "${packageName}"\nversion = "1.0.0"\nauthors = []\n\n[dev-addresses]\n\n[dependencies]\n${deps}\n\n[dev-dependencies]`;
}

async function processModules(rpc: string, account: string, modules: PackageModule[], outputDir: string): Promise<void> {
    for (const module of modules) {
        const moduleName = module.name;
        const modulePath = path.join(outputDir, `${moduleName}.move`);
        let response = await get_module_abi(rpc, account, moduleName);

        const structs = response.abi.structs.map((module) => {
            return `${aptosStructToMove(module)}\n`;
        }).join('\n');

        const functions = response.abi.exposed_functions.map((module) => {
            return `${aptosFunctionToMove(module)}\n`;
        }).join('\n');

        let fileContent = `module ${response.abi.address}::${response.abi.name} {\n${structs}\n${functions}\n}`;

        await fs.writeFile(modulePath, fileContent, 'utf-8');
        console.log(`文件创建成功: ${modulePath}`);
    }
}

async function downloadPackage(rpc: string, account: string, packageName: string, outputDir: string, isRoot: boolean = false): Promise<void> {
    const uniquePackageName = `${packageName}_${account.replace(/^0x/, '')}`;
    console.log(`Downloading package: ${uniquePackageName} from account: ${account}`);
    
    try {
        // Get account resources with Bearer token
        const headers = createHeaders();
        const response = await fetch(`${rpc}/v1/accounts/${account}/resources`, { headers });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const jsonData: AptosResource[] = await response.json();

        // Find package registry
        const packageRegistry = jsonData.find(item => item.type === '0x1::code::PackageRegistry');
        if (!packageRegistry) {
            throw new Error('PackageRegistry not found in the response.');
        }
        const packages = packageRegistry.data?.packages;
        if (!packages) {
            throw new Error('No packages found in PackageRegistry.');
        }

        // Find target package
        let targetPackage = packages.find(pkg => pkg.name === packageName);
        if (!targetPackage) {
            throw new Error(`Package ${packageName} not found.`);
        }

        // Create directory for the package
        await fs.mkdir(outputDir, { recursive: true });
        console.log(`文件夹创建成功: ${outputDir}`);

        // Create sources directory
        const sourcesPath = path.join(outputDir, "sources");
        await fs.mkdir(sourcesPath, { recursive: true });
        
        // Process modules
        await processModules(rpc, account, targetPackage.modules, sourcesPath);

        // Create Move.toml
        const moveTomlPath = path.join(outputDir, "Move.toml");
        const moveTomlContent = await generateMoveToml(packageName, account, targetPackage, isRoot);
        await fs.writeFile(moveTomlPath, moveTomlContent, 'utf-8');
        console.log(`Move.toml 文件创建成功: ${moveTomlPath}`);

        // No longer download nested dependencies here - they'll be handled by processUrlAndCreatePackage
    } catch (error) {
        console.error(`Error downloading package ${packageName}:`, error instanceof Error ? error.message : error);
        throw error;
    }
}

// Export the main function for CLI usage
export async function createMockPackage(rpc: string, account: string, packageName: string, targetDir?: string) {
    try {
        const baseDir = targetDir || process.cwd();
        const folderPath = path.join(baseDir, packageName);
        
        console.log(`Using RPC: ${rpc}`);
        console.log(`Using account: ${account}`);
        console.log(`Target package: ${packageName}`);
        console.log(`Output directory: ${folderPath}`);
        
        const token = getBearerToken();
        if (token) {
            console.log('Using Bearer token for authentication');
        }

        // First collect all dependencies
        const depsMap = await collectAllDependencies(rpc, account, packageName);
        console.log(`Collected ${depsMap.size} unique dependencies`);
        
        // Download the root package
        await downloadPackage(rpc, account, packageName, folderPath, true);
        
        // Create deps directory for root package
        const depsDir = path.join(folderPath, "deps");
        await fs.mkdir(depsDir, { recursive: true });
        
        // Download all dependencies flat into the deps directory
        for (const [_, dep] of depsMap.entries()) {
            const depDir = path.join(depsDir, `${dep.packageName}_${dep.account.replace(/^0x/, '')}`);
            await downloadPackage(rpc, dep.account, dep.packageName, depDir, false);
        }
        
        console.log('All operations completed successfully!');
    } catch (error) {
        console.error('Error during processing:', error instanceof Error ? error.message : error);
        throw error;
    }
}

// Setup CLI
yargs(hideBin(process.argv))
    .command('create <account> <package> [directory]', 'Create a mock Aptos package', (yargs) => {
        return yargs
            .positional('account', {
                describe: 'Account address',
                type: 'string',
                demandOption: true
            })
            .positional('package', {
                describe: 'Package name',
                type: 'string',
                demandOption: true
            })
            .positional('directory', {
                describe: 'Target directory',
                type: 'string',
                default: './'
            })
            .option('rpc', {
                alias: 'r',
                describe: 'RPC URL',
                type: 'string',
                default: 'https://api.mainnet.aptoslabs.com'
            })
            .option('token', {
                alias: 't',
                describe: 'Bearer token for API authentication',
                type: 'string'
            });
    }, async (argv) => {
        try {
            // Set token from CLI if provided
            if (argv.token) {
                process.env.APTOS_API_TOKEN = argv.token;
            }
            
            await createMockPackage(
                argv.rpc as string, 
                argv.account as string,
                argv.package as string,
                argv.directory as string
            );
        } catch (error) {
            console.error('Command failed:', error);
            process.exit(1);
        }
    })
    .demandCommand(1)
    .example('$0 create 0x1 AptosStdlib ./output', 'Create a mock of the AptosStdlib package')
    .example('$0 create 0x1 AptosStdlib --token YOUR_TOKEN', 'Create a mock with a Bearer token')
    .wrap(null)
    .help()
    .argv;
