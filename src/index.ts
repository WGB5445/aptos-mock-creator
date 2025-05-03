import { promises as fs } from 'fs';
import path from 'path';

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

async function get_module_abi(rpc: string, account: string, module: string): Promise<Response> {
    const response = await fetch(`${rpc}/v1/accounts/${account}/module/${module}`);
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
    // Get account resources
    const response = await fetch(`${rpc}/v1/accounts/${account}/resources`);
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
      if (dep.account !== "0x1") {
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

// Update the generateMoveToml function to handle flat dependency structure
async function generateMoveToml(packageName: string, account: string, targetPackage: PackageInfo, isRoot: boolean = false): Promise<string> {
    if (account === "0x1") {
        return `[package]\nname = "${packageName}"\nversion = "1.0.0"\nauthors = []\n\n[dev-addresses]\n\n[dependencies]\n\n[dev-dependencies]`;
    } else {
        const deps = targetPackage.deps.map((dep) => {
            if (["0x1","0x3","0x4"].includes(dep.account)) {
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
                // For the root package, reference deps in the deps directory
                if (isRoot) {
                    return `${dep.package_name} = { local = "deps/${dep.package_name}" }`;
                } else {
                    // For dependency packages, reference sibling deps
                    return `${dep.package_name} = { local = "./${dep.package_name}" }`;
                }
            }
        }).join('\n');

        return `[package]\nname = "${packageName}"\nversion = "1.0.0"\nauthors = []\n\n[dev-addresses]\n\n[dependencies]\n${deps}\n\n[dev-dependencies]`;
    }
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
    console.log(`Downloading package: ${packageName} from account: ${account}`);
    
    try {
        // Get account resources
        const response = await fetch(`${rpc}/v1/accounts/${account}/resources`);
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

async function processUrlAndCreatePackage(rpc: string, account: string, packageName: string, targetDir?: string) {
    try {
        const baseDir = targetDir || process.cwd();
        const folderPath = path.join(baseDir, packageName);
        
        console.log(`目标目录: ${folderPath}`);

        // Check if folder exists and remove it if it does
        try {
            await fs.access(folderPath);
            console.log(`文件夹已存在: ${folderPath}`);
            await fs.rm(folderPath, { recursive: true, force: true });
            console.log(`文件夹已删除: ${folderPath}`);
        } catch (err) {
            // Folder doesn't exist, do nothing
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
            const depDir = path.join(depsDir, dep.packageName);
            await downloadPackage(rpc, dep.account, dep.packageName, depDir, false);
        }
        
        console.log('所有操作完成！');
    } catch (error) {
        console.error('处理过程中发生错误:', error instanceof Error ? error.message : error);
    }
}

// 使用示例
const jsonUrl = 'https://api.mainnet.aptoslabs.com'; // 替换为你的 JSON URL
const targetDirectory = './test'; // 可选的目标目录，不指定则使用当前目录

processUrlAndCreatePackage(jsonUrl, "0x886d532004154847453321247ce11e9a044ebf2b6ca3f210c58ce2cfffbcff0c", "sui-swap", targetDirectory).catch(console.error);