import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  HttpStatus,
  HttpCode,
  Query,
  HttpException,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { Message, Task } from '@prisma/client';
import { AddTaskMessageDto } from './dto/add-task-message.dto';
import { MessagesService } from '../messages/messages.service';
import { ANTHROPIC_MODELS } from '../anthropic/anthropic.constants';
import { OPENAI_MODELS } from '../openai/openai.constants';
import { GOOGLE_MODELS } from '../google/google.constants';
import { BytebotAgentModel } from 'src/agent/agent.types';

const geminiApiKey = process.env.GEMINI_API_KEY;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

// Default to localhost:4000 if not set (matches ProxyService default)
const proxyUrl = process.env.BYTEBOT_LLM_PROXY_URL || 'http://localhost:4000';

const models = [
  ...(anthropicApiKey ? ANTHROPIC_MODELS : []),
  ...(openaiApiKey ? OPENAI_MODELS : []),
  ...(geminiApiKey ? GOOGLE_MODELS : []),
];

@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly messagesService: MessagesService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createTaskDto: CreateTaskDto): Promise<Task> {
    return this.tasksService.create(createTaskDto);
  }

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('statuses') statuses?: string,
  ): Promise<{ tasks: Task[]; total: number; totalPages: number }> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;

    // Handle both single status and multiple statuses
    let statusFilter: string[] | undefined;
    if (statuses) {
      statusFilter = statuses.split(',');
    } else if (status) {
      statusFilter = [status];
    }

    return this.tasksService.findAll(pageNum, limitNum, statusFilter);
  }

  @Get('models')
  async getModels() {
    const allModels: BytebotAgentModel[] = [];

    // Always try to add Ollama models (default proxy URL is localhost:4000)
    const ollamaModel = process.env.OLLAMA_MODEL || 'ollama/llama3.2';
    
    // Add fallback model as first option
    allModels.push({
      provider: 'fallback',
      name: ollamaModel,
      title: 'Ollama (with Fallback to Gemini)',
      contextWindow: 128000,
    });

    // Try to fetch models from LiteLLM proxy
    try {
      const response = await fetch(`${proxyUrl}/model/info`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add timeout to avoid hanging
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const proxyModels = await response.json();

        // Map proxy response to BytebotAgentModel format
        if (proxyModels.data && Array.isArray(proxyModels.data)) {
          const proxyModelList: BytebotAgentModel[] = proxyModels.data.map(
            (model: any) => ({
              provider: 'proxy',
              name: model.litellm_params?.model || model.model_name,
              title: model.model_name || model.litellm_params?.model || 'Unknown',
              contextWindow: 128000,
            }),
          );

          allModels.push(...proxyModelList);
        }
      }
    } catch (error: any) {
      // If proxy is not available, try to fetch directly from Ollama
      console.warn(
        `Could not fetch models from LiteLLM proxy (${proxyUrl}): ${error.message}`,
      );
      console.log(
        'Tip: Start LiteLLM proxy with: litellm --config litellm-config.yaml --port 4000',
      );

      // Fallback: Try to get models directly from Ollama API
      try {
        const ollamaResponse = await fetch('http://localhost:11434/api/tags', {
          method: 'GET',
          signal: AbortSignal.timeout(3000),
        });

        if (ollamaResponse.ok) {
          const ollamaData = await ollamaResponse.json();
          if (ollamaData.models && Array.isArray(ollamaData.models)) {
            const ollamaModelList: BytebotAgentModel[] = ollamaData.models.map(
              (model: any) => ({
                provider: 'proxy',
                name: `ollama/${model.name}`,
                title: model.name,
                contextWindow: 128000,
              }),
            );

            // Add Ollama models (skip duplicates)
            ollamaModelList.forEach((model) => {
              if (
                !allModels.some(
                  (m) => m.name === model.name || m.title === model.title,
                )
              ) {
                allModels.push(model);
              }
            });
          }
        }
      } catch (ollamaError: any) {
        console.warn(
          `Could not fetch models from Ollama: ${ollamaError.message}`,
        );
      }
    }

    // Add other configured models
    allModels.push(...models);

    return allModels;
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<Task> {
    return this.tasksService.findById(id);
  }

  @Get(':id/messages')
  async taskMessages(
    @Param('id') taskId: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ): Promise<Message[]> {
    const options = {
      limit: limit ? parseInt(limit, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
    };

    const messages = await this.messagesService.findAll(taskId, options);
    return messages;
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  async addTaskMessage(
    @Param('id') taskId: string,
    @Body() guideTaskDto: AddTaskMessageDto,
  ): Promise<Task> {
    return this.tasksService.addTaskMessage(taskId, guideTaskDto);
  }

  @Get(':id/messages/raw')
  async taskRawMessages(
    @Param('id') taskId: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ): Promise<Message[]> {
    const options = {
      limit: limit ? parseInt(limit, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
    };

    return this.messagesService.findRawMessages(taskId, options);
  }

  @Get(':id/messages/processed')
  async taskProcessedMessages(
    @Param('id') taskId: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    const options = {
      limit: limit ? parseInt(limit, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
    };

    return this.messagesService.findProcessedMessages(taskId, options);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    await this.tasksService.delete(id);
  }

  @Post(':id/takeover')
  @HttpCode(HttpStatus.OK)
  async takeOver(@Param('id') taskId: string): Promise<Task> {
    return this.tasksService.takeOver(taskId);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  async resume(@Param('id') taskId: string): Promise<Task> {
    return this.tasksService.resume(taskId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') taskId: string): Promise<Task> {
    return this.tasksService.cancel(taskId);
  }
}
