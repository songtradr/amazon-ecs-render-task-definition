const path = require('path');
const core = require('@actions/core');
const tmp = require('tmp');
const fs = require('fs');

async function run() {
  try {
    // Get inputs
    const taskDefinitionFile = core.getInput('task-definition', { required: true });
    const containerName = core.getInput('container-name', { required: true });
    const imageURI = core.getInput('image', { required: true });
    const taskFamily = core.getInput('task-family', { required: true });
    const entryPoint = core.getInput('entry-point', { required: false }) || '';
    const memory = core.getInput('memory', { required: false }) || '';
    const cpu = core.getInput('cpu', { required: false }) || '';
    const storageSize = core.getInput('ephemeral-storage-size-in-gib', { required: false }) || '';
    const environmentVariablesFile = core.getInput('environment-file', { required: false }) || '';
    const secretsFile = core.getInput('secrets-file', { required: false }) || '';
    const dataDogTags = core.getInput('datadog-tags', { required: false }) || '';

    // Parse the task definition
    const taskDefPath = path.isAbsolute(taskDefinitionFile) ?
      taskDefinitionFile :
      path.join(process.env.GITHUB_WORKSPACE, taskDefinitionFile);
    if (!fs.existsSync(taskDefPath)) {
      throw new Error(`Task definition file does not exist: ${taskDefinitionFile}`);
    }
    const taskDefContents = require(taskDefPath);

    taskDefContents.family = taskFamily;

    // Insert the image URI
    if (!Array.isArray(taskDefContents.containerDefinitions)) {
      throw new Error('Invalid task definition format: containerDefinitions section is not present or is not an array');
    }
    const containerDef = taskDefContents.containerDefinitions.find(function(element) {
      return element.name == containerName;
    });
    if (!containerDef) {
      throw new Error('Invalid task definition: Could not find container definition with matching name');
    }
    containerDef.image = imageURI;

    if (entryPoint) {
      containerDef.entryPoint = entryPoint.split(' ');
    }

    if (environmentVariablesFile) {
      const envFilePath = path.isAbsolute(environmentVariablesFile) ?
        environmentVariablesFile :
        path.join(process.env.GITHUB_WORKSPACE, environmentVariablesFile);
      containerDef.environment = require(envFilePath);
    }
    if (secretsFile) {
      const secretsFilePath = path.isAbsolute(secretsFile) ?
        secretsFile :
        path.join(process.env.GITHUB_WORKSPACE, secretsFile);
      containerDef.secrets = require(secretsFilePath);
    }

    if(dataDogTags && containerDef.logConfiguration && containerDef.logConfiguration.options ) {
      const options = containerDef.logConfiguration.options;
      if (options['Name'] == 'datadog') {
        options['dd_tags'] = dataDogTags;
      }
    }

    const datadogAgentContainerDev = taskDefContents.containerDefinitions.find(function(element) {
      return element.name == 'datadog-agent';
    });

    if (datadogAgentContainerDev && dataDogTags) {
      const ddTagsEnv = datadogAgentContainerDev.environment.find(envVar => envVar.name === 'DD_TAGS')
      if (ddTagsEnv) {
        ddTagsEnv.value = dataDogTags;
      } else {
        datadogAgentContainerDev.environment.push({ name: 'DD_TAGS', value: dataDogTags });
      }
    }

    if (memory) {
      taskDefContents.memory = memory;
    }
    if (cpu) {
      taskDefContents.cpu = cpu;
    }
    if (storageSize) {
      taskDefContents.ephemeralStorage = {
        sizeInGiB: parseInt(storageSize, 10)
      };
    }

    // Write out a new task definition file
    var updatedTaskDefFile = tmp.fileSync({
      tmpdir: process.env.RUNNER_TEMP,
      prefix: 'task-definition-',
      postfix: '.json',
      keep: true,
      discardDescriptor: true
    });
    const newTaskDefContents = JSON.stringify(taskDefContents, null, 2);
    fs.writeFileSync(updatedTaskDefFile.name, newTaskDefContents);
    core.setOutput('task-definition', updatedTaskDefFile.name);
  }
  catch (error) {
    core.setFailed(error.message);
  }
}

module.exports = run;

/* istanbul ignore next */
if (require.main === module) {
    run();
}
