import { promises as fs } from 'fs';
import { url } from 'inspector';
import path from 'path';
/*

[
  {
    type: '0x1::object::ObjectCore',
    data: {
      allow_ungated_transfer: true,
      guid_creation_num: '1125899906842625',
      owner: '0x72dd3ce26390113abf284d9dd1fc33339a701ecc16c9afe09df344bfa24093d6',
      transfer_events: [Object]
    }
  },
  {
    type: '0x1::object_code_deployment::ManagingRefs',
    data: { extend_ref: [Object] }
  },
  { type: '0x1::code::PackageRegistry', data: { packages: [Array] } }
  },
  {
    type: '0x1::object_code_deployment::ManagingRefs',
    data: { extend_ref: [Object] }
  },
  },
  {
    type: '0x1::object_code_deployment::ManagingRefs',
  },
  {
    type: '0x1::object_code_deployment::ManagingRefs',
    data: { extend_ref: [Object] }
  },
  { type: '0x1::code::PackageRegistry', data: { packages: [Array] } }
]

*/

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

// 主函数
async function processUrlAndCreateFiles(url: string, targetDir?: string) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const jsonData: Response = await response.json();

        console.log(jsonData)
 
        const baseDir = targetDir || process.cwd();
        const folderPath = path.join(baseDir, jsonData.abi.name);
        
        console.log(`目标目录: ${folderPath}`);

        try {
            await fs.mkdir(folderPath, { recursive: true });
            console.log(`文件夹创建成功: ${folderPath}`);
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
                throw err;
            }
            console.log(`文件夹已存在: ${folderPath}`);
        }
        
        // 4. 创建文件
        // for (const file of jsonData.abi.) {
           
        // }
        const filePath = path.join(folderPath, jsonData.abi.name);
        await fs.writeFile(filePath, JSON.stringify(jsonData.abi.structs, null, 2), 'utf-8');
        console.log(`文件创建成功: ${filePath}`);

        console.log('所有操作完成！');
    } catch (error) {
        console.error('处理过程中发生错误:', error instanceof Error ? error.message : error);
    }
}

async function processUrlAndCreatePackage(rpc: string, account: string, packageName: string, targetDir?: string) {
    try {
        const response = await fetch(`${rpc}/v1/accounts/${account}/resources`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const jsonData: AptosResource[] = await response.json();

        const packageRegistry = jsonData.find(item => item.type === '0x1::code::PackageRegistry');
        if (!packageRegistry) {
            throw new Error('PackageRegistry not found in the response.');
        }
        const packages = packageRegistry.data?.packages;
        if (!packages) {
            throw new Error('No packages found in PackageRegistry.');
        }

        console.log('Packages:', packages);

        let targetPackage = packages.find(pkg => pkg.name === packageName);
        if (!targetPackage) {
            throw new Error(`Package ${packageName} not found.`);
        }
        console.log('Package:', targetPackage.modules);
        const baseDir = targetDir || process.cwd();
        const folderPath = path.join(baseDir, packageName);
        
        console.log(`目标目录: ${folderPath}`);

        try {
            await fs.access(folderPath);

            console.log(`文件夹已存在: ${folderPath}`);

            await fs.rm(folderPath, { recursive: true, force: true });

            console.log(`文件夹已删除: ${folderPath}`);
        } catch (err) {
        } finally {
            await fs.mkdir(folderPath, { recursive: true });
            console.log(`文件夹创建成功: ${folderPath}`);
        }

        const sourcesPath = path.join(folderPath, "sources");

        await fs.mkdir(sourcesPath, { recursive: true });

        for(const module of targetPackage.modules) {
            const moduleName = module.name;
            const modulePath = path.join(sourcesPath, `${moduleName}.move`);
            let response = await get_module_abi(rpc, account, moduleName);

            const structs = response.abi.structs.map((module)=>{
                return `${aptosStructToMove(module)}\n`;
            }).join('\n');

            const functions = response.abi.exposed_functions.map((module)=>{
                return `${aptosFunctionToMove(module)}\n`
            }).join('\n');

            let fileContent = `module ${response.abi.address}::${response.abi.name} {\n${structs}\n${functions}\n}`;

            await fs.writeFile(modulePath, fileContent , 'utf-8');

            console.log(`文件创建成功: ${modulePath}`);
        }
        
        // // 4. 创建文件
        // // for (const file of jsonData.abi.) {
           
        // // }
        // const filePath = path.join(folderPath, jsonData.abi.name);
        // await fs.writeFile(filePath, JSON.stringify(jsonData.abi.structs, null, 2), 'utf-8');
        // console.log(`文件创建成功: ${filePath}`);

        console.log('所有操作完成！');
    } catch (error) {
        console.error('处理过程中发生错误:', error instanceof Error ? error.message : error);
    }
}

// 使用示例
const jsonUrl = 'https://api.devnet.aptoslabs.com'; // 替换为你的 JSON URL
const targetDirectory = './test'; // 可选的目标目录，不指定则使用当前目录

// processUrlAndCreateFiles(jsonUrl, targetDirectory).catch(console.error);
processUrlAndCreatePackage(jsonUrl, "0x1", "MoveStdlib", targetDirectory).catch(console.error);