import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { MessagesModule } from '../messages/messages.module';
import { AnthropicModule } from '../anthropic/anthropic.module';
import { AgentProcessor } from './agent.processor';
import { ConfigModule } from '@nestjs/config';
import { AgentScheduler } from './agent.scheduler';
import { InputCaptureService } from './input-capture.service';
import { OpenAIModule } from '../openai/openai.module';
import { GoogleModule } from '../google/google.module';
import { SummariesModule } from 'src/summaries/summaries.modue';
import { AgentAnalyticsService } from './agent.analytics';
import { ProxyModule } from 'src/proxy/proxy.module';
import { AgentFallbackService } from './agent.fallback.service';
import { AnthropicService } from '../anthropic/anthropic.service';
import { OpenAIService } from '../openai/openai.service';
import { GoogleService } from '../google/google.service';
import { ProxyService } from '../proxy/proxy.service';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    TasksModule,
    MessagesModule,
    SummariesModule,
    AnthropicModule,
    OpenAIModule,
    GoogleModule,
    ProxyModule,
  ],
  providers: [
    AgentProcessor,
    AgentScheduler,
    InputCaptureService,
    AgentAnalyticsService,
    {
      provide: AgentFallbackService,
      useFactory: (
        configService: ConfigService,
        anthropicService: AnthropicService,
        openaiService: OpenAIService,
        googleService: GoogleService,
        proxyService: ProxyService,
      ) => {
        const services = {
          anthropic: anthropicService,
          openai: openaiService,
          google: googleService,
          proxy: proxyService,
        };
        return new AgentFallbackService(configService, services);
      },
      inject: [
        ConfigService,
        AnthropicService,
        OpenAIService,
        GoogleService,
        ProxyService,
      ],
    },
  ],
  exports: [AgentProcessor, AgentFallbackService],
})
export class AgentModule {}
