# AI Agent 的未来是事件驱动的

https://mp.weixin.qq.com/s/029Ywh4oGpzV7F2ujPYkjA

https://medium.com/@seanfalconer/the-future-of-ai-agents-is-event-driven-9e25124060d6

AI Agent 将通过自主问题解决、自适应工作流和可扩展性，彻底改变企业运营。但真正的挑战并不在于构建更好的模型。

Agent 需要访问数据、工具，并具备跨系统共享信息的能力，使其输出可供多个服务（包括其他 Agent）使用。这不是一个 AI 问题，而是基础设施和数据互操作性的问题。它不仅仅是简单地拼接指令链，而是需要一种基于数据流的事件驱动架构（Event-Driven Architecture，EDA）。

正如 HubSpot（是一家总部位于美国的集客营销、销售和客户服务软件产品开发商和营销商） CTO Dharmesh Shah 所说：“Agent 是新的应用程序。” 要实现这一潜力，必须从一开始就投资于正确的设计模式。

本文探讨了为什么 EDA 是扩展 Agent 并在现代企业系统中释放其全部潜力的关键。

要深入理解 EDA 为什么对 AI 的下一波发展至关重要，我们首先需要回顾 AI 发展至今的历程。

## **AI 的演进** 

AI 经过了两个不同的发展阶段，并正步入第三阶段。前两次浪潮带来了新的可能性，但也存在关键的局限性。



### **第一波 AI：预测模型**

第一波 AI 以传统机器学习为核心，专注于针对特定任务的预测能力。



![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/SaeK9tW7BuibB0cnmQMkAicXXMTCEuyGEOAvic93EY1G9Eqibc2JTia3brTKl9F9EqJicLXu2QeWcaDuGibHTmhVjic7fw/640?wx_fmt=png&from=appmsg&tp=webp&wxfrom=5&wx_lazy=1&wx_co=1)



构建这些模型需要深厚的专业知识，因为它们是针对特定的使用场景精心设计的。这些模型具有领域专属性，而这种专属性被嵌入到训练数据中，使得它们非常僵化，难以重新利用。如果想要将一个模型适配到新的领域，往往需要从头开始训练——这种方法缺乏可扩展性，并且大大降低了 AI 的推广速度。



### **第二波 AI：生成式模型**

生成式 AI 由深度学习驱动，标志着 AI 发展的一个转折点。



与第一波 AI 受限于单一领域不同，生成式模型是在海量、多样化的数据集上进行训练的，因此具备了跨不同场景泛化的能力。它们可以生成文本、图像，甚至视频，为 AI 的应用开辟了全新的可能性。然而，这一波 AI 也带来了新的挑战。



生成式模型是“静态”的——它们无法动态地整合新的信息，也难以进行快速适配。虽然可以通过微调（fine-tuning）来满足特定领域的需求，但这种方式成本高昂且容易出错。微调需要庞大的数据集、强大的计算资源以及深厚的机器学习专业知识，这使得它在许多情况下难以实际应用。此外，由于 LLM（大语言模型）主要基于公开数据训练，它们无法直接访问专有的行业数据，因此在回答需要具体上下文的信息时往往显得力不从心。



例如，如果你要求一个生成式模型推荐一份符合用户个人健康状况、所在地区和财务目标的保险方案……



![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/SaeK9tW7BuibB0cnmQMkAicXXMTCEuyGEOU8juoIqDJIWd7SBmJ1yHzibicpXeOJ7bQrzRRIHEDwXlPHGO8yB0nicIw/640?wx_fmt=png&from=appmsg&tp=webp&wxfrom=5&wx_lazy=1&wx_co=1)



在这个场景中，你向 LLM 提供提示词，它随后生成一个回复。然而，由于模型无法访问相关的用户数据，因此它无法提供准确的推荐。缺少这些数据，模型的回答要么是泛泛而谈，要么完全错误。



### **复合 AI 弥合这一鸿沟**

为了克服这些局限性，复合 AI（Compound AI）系统将生成式模型与编程逻辑、数据检索机制和验证层等组件集成在一起。这种模块化设计使 AI 能够灵活调用工具、获取相关数据，并根据具体情况定制输出——这正是静态模型所无法做到的。



以保险推荐为例：

1. 数据检索机制，从安全数据库中提取用户的健康和财务数据。
2. 这些数据被添加到 LLM 提示词的上下文中，以确保模型能够基于完整信息进行推理。
3. LLM：结合组装后的提示词生成精准的推荐结果。



![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/SaeK9tW7BuibB0cnmQMkAicXXMTCEuyGEO1fJWSdX6VvylxdofeK8WaFPfeicarf1jvlknShqb5cbZvtOJZo0Vdxw/640?wx_fmt=png&from=appmsg&tp=webp&wxfrom=5&wx_lazy=1&wx_co=1)



这一过程被称为**检索增强生成（RAG）**，它通过在模型的工作流中动态引入相关数据，弥合了静态 AI 与现实需求之间的鸿沟。



虽然 RAG 在处理这类任务时表现良好，但它依赖于**固定的工作流**，这意味着每一次交互和执行路径都必须**预先定义**。这种刚性限制了 RAG 在应对更加复杂或动态任务时的能力，因为这些任务的所有执行路径无法被穷尽式地编码。手动定义所有可能的执行路径不仅劳动密集型，而且最终会成为 AI 发展的瓶颈。



固定流程架构的局限性，催生了 AI 的**第三波浪潮：Agentic 系统**。



### **Agentic AI 的崛起**

尽管 AI 取得了长足进步，但固定系统甚至 LLM 本身的局限性已逐渐显现。



据报道，Google 的 Gemini 在训练了更大规模的数据集后，仍未能达到内部预期。OpenAI 的下一代 Orion 模型也传出了类似的结果。



Salesforce CEO Marc Benioff 在《华尔街日报》的 *Future of Everything* 播客中表示，我们已经接近 LLM 能力的上限。他认为，未来属于**自主 Agent**——即**能够自主思考、适应并独立行动的系统**，而不是 GPT-4 这样的模型。



Agent 带来了全新的能力：**动态、基于上下文的工作流**。不同于固定流程，Agentic 系统能够**即时决定下一步行动**，根据当前环境自适应调整。这使得它们特别适用于当今企业面临的**不可预测、相互关联的问题**。



![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/SaeK9tW7BuibB0cnmQMkAicXXMTCEuyGEOM455aeOKCpFcz7YY4oVic6OiaPvPlNaa9KFRLoiaV5lk2ckUL1987k26w/640?wx_fmt=png&from=appmsg&tp=webp&wxfrom=5&wx_lazy=1&wx_co=1)



Agent 颠覆了传统的控制逻辑。



传统系统依赖**刚性程序**来规定每一个操作步骤，而 Agent 则**利用 LLM 来驱动决策**。它们可以**推理、调用工具、访问记忆**——且一切都能动态进行。



这种灵活性使得工作流能够**实时演变**，让 Agent 远比基于固定逻辑的系统更加强大。



![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/SaeK9tW7BuibB0cnmQMkAicXXMTCEuyGEO3HZOv1SEuE0IY13gMFTqbjbISJJNVqDo1tVKL17SjovAibGrBHjQSNQ/640?wx_fmt=png&from=appmsg&tp=webp&wxfrom=5&wx_lazy=1&wx_co=1)





## **设计模式如何塑造更智能的 Agent**  

AI Agent 的强大不仅来源于其核心能力，还取决于**设计模式**对其工作流和交互方式的结构化管理。这些模式使 Agent 能够解决复杂问题、适应变化的环境，并高效协作。



下面介绍几种常见的设计模式，它们能够提升 Agent 的智能性和执行能力。

### **反思（Reflection）：通过自我评估不断优化**

反思能力使 Agent 能够在执行操作或生成最终回复之前**评估自己的决策并改进输出**。



这种机制让 Agent 能够**发现并修正错误**，优化推理过程，并确保更高质量的结果。



![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/SaeK9tW7BuibB0cnmQMkAicXXMTCEuyGEODPo2iaDZ9FhcaWtTdqtGJ9gH3H1WSibyrGqFmZrKUylQlM9AMLjPZibWQ/640?wx_fmt=png&from=appmsg&tp=webp&wxfrom=5&wx_lazy=1&wx_co=1)



### **工具使用扩展 Agent 能力**

与外部工具的接口扩展了 Agent 的功能，使其能够执行如**数据检索、过程自动化**或**执行确定性工作流**等任务。这对于要求严格精确性的操作尤为重要，例如数学计算或数据库查询，其中精度是不可妥协的。



工具的使用弥合了**灵活决策**与**可预测、可靠执行**之间的鸿沟。



![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/SaeK9tW7BuibB0cnmQMkAicXXMTCEuyGEOchoZ2h3VWkKazpibobLRGabWpqtjTSPS3B1D2fyxL5BlLmQ9yuqsNxg/640?wx_fmt=png&from=appmsg&tp=webp&wxfrom=5&wx_lazy=1&wx_co=1)



### **规划将目标转化为行动**

具备规划能力的 Agent 可以将高层次的目标分解为可执行的步骤，并以**逻辑顺序**组织任务。这个设计模式对于解决**多步骤问题**或**管理具有依赖关系的工作流**至关重要。



![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/SaeK9tW7BuibB0cnmQMkAicXXMTCEuyGEOhNrTVN3FM7cH7TaVqFJHfqYygV6hLtrBF0RDGydaxHdo8uHZOS8uFw/640?wx_fmt=png&from=appmsg&tp=webp&wxfrom=5&wx_lazy=1&wx_co=1)

### **多智能体协作：模块化思维**

多智能体系统通过将特定任务分配给专门的 Agent 来采取模块化的解决方案。这种方法具有灵活性：你可以使用**较小的语言模型（SLM）**为任务特定的 Agent 提高效率，并简化记忆管理。模块化设计通过将每个 Agent 的上下文集中在其特定任务上，从而减少了单个 Agent 的复杂性。



一种相关的技术是**专家混合（Mixture-of-Experts，MoE）**，它在单一框架内使用专门的子模型或“专家”。像多智能体协作一样，MoE 动态地将任务分配给最相关的专家，优化计算资源并提高性能。这两种方法都强调**模块化和专业化**——无论是通过多个 Agent 独立工作，还是通过在统一模型中进行任务特定的路由。



正如传统系统设计中所做的那样，将问题拆分为模块化组件使其更容易维护、扩展和适应。通过协作，这些专业化的 Agent 可以共享信息、分担责任，并协调行动，以更高效地解决复杂挑战。



![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/SaeK9tW7BuibB0cnmQMkAicXXMTCEuyGEOxYSJJrgsUXmD7PhX61hicCjKx8uas4SsAhNq3s46DUKJnYm4Yc8Gicvg/640?wx_fmt=png&from=appmsg&tp=webp&wxfrom=5&wx_lazy=1&wx_co=1)



简而言之，Agent 不仅仅执行工作流；它们重新定义了我们对工作流的理解。它们是构建可扩展、适应性强的 AI 系统的下一步——突破了传统架构的限制以及当前 LLM 的局限性。



### **Agentic RAG：自适应和上下文感知的检索**

Agentic RAG 通过使其更加动态和基于上下文驱动，从而发展了传统的 RAG。与依赖固定工作流不同，Agent 可以实时决定它们需要哪些数据、在哪里找到这些数据，并根据当前任务如何优化查询。这种灵活性使得 Agentic RAG 特别适用于处理需要响应能力和适应性的复杂多步骤工作流。



例如，一个创建营销策略的 Agent 可能首先从 CRM 中提取客户数据，使用 API 收集市场趋势，并在新信息出现时不断调整策略。通过通过记忆保留上下文并迭代查询，Agent 能够生成更准确、更相关的输出。Agentic RAG 将**检索、推理和行动**结合在一起。



![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/SaeK9tW7BuibB0cnmQMkAicXXMTCEuyGEOgNLtz7uj5XVFQftrnUL9POOuSpCsm3l7P307ic9hiaJLib1kK6tBtpGzQ/640?wx_fmt=png&from=appmsg&tp=webp&wxfrom=5&wx_lazy=1&wx_co=1)







## **扩展智能 Agent 面临的挑战**  

扩展 Agent —— 无论是单个 Agent 还是协作系统 —— 取决于它们**轻松访问和共享数据**的能力。Agent 需要从多个来源收集信息，包括其他 Agent、工具和外部系统，以便做出决策并采取行动。



![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/SaeK9tW7BuibB0cnmQMkAicXXMTCEuyGEOCJKpzGhroJD9075XOMc8eziaayWxKkbILb9nD38P9krDFRTDNictkYVA/640?wx_fmt=png&from=appmsg&tp=webp&wxfrom=5&wx_lazy=1&wx_co=1)



将 Agent 连接到它们所需的工具和数据，从根本上讲是一个**分布式系统问题**。这种复杂性与设计微服务时面临的挑战相似，因为在微服务中，各个组件必须高效地进行通信，而不产生瓶颈或僵化的依赖关系。



像微服务一样，Agent 必须高效通信，并确保其输出在更广泛的系统中具有实用性。就像任何服务一样，它们的输出不仅仅应该回流到 AI 应用程序中——它们还应该流入其他关键系统，如数据仓库、CRM、CDP 和客户成功平台。



当然，你可以通过 RPC 和 API 将 Agent 与工具连接起来，但这会导致系统的紧耦合。紧耦合使得扩展、适应或支持多个数据消费者变得更加困难。Agent 需要灵活性。它们的输出必须无缝地流入其他 Agent、服务和平台，而不将所有内容锁定在僵化的依赖关系中。

### **解决方案是什么？**



通过事件驱动架构（EDA）实现**松耦合**。它是允许 Agent 共享信息、实时行动并与更广泛生态系统集成的支柱——无需紧耦合带来的头痛问题。

## **EDA**  

在早期，软件系统是单体的。一切都存在于一个单一、紧密集成的代码库中。尽管单体应用简单易构建，但随着系统的增长，它们变得极其复杂且难以维护。



扩展就像一把钝器：你必须扩展整个应用程序，即使只有其中的一部分需要扩展。这种低效导致了系统膨胀和脆弱架构，无法应对增长的需求。



### **微服务**改变了这一局面。



通过将应用程序拆分成更小的、可独立部署的组件，团队可以扩展和更新特定部分，而不必触及整个系统。但这也带来了一个新问题：这些更小的服务如何高效通信？

如果我们通过直接的 RPC 或 API 调用来连接服务，就会产生大量的相互依赖关系。如果其中一个服务出现故障，它将影响整个连接路径上的所有节点。



![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/SaeK9tW7BuibB0cnmQMkAicXXMTCEuyGEONOcxkMicgicrnDJopCMde0iaGFics8VwLLUctL5JTDg2c2BJw610sFJA8w/640?wx_fmt=png&from=appmsg&tp=webp&wxfrom=5&wx_lazy=1&wx_co=1)



### **EDA 解决了这个问题。**

与紧耦合的同步通信不同，事件驱动架构（EDA）使得组件能够通过事件进行异步通信。服务之间不再互相等待——它们实时响应正在发生的事情。



![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/SaeK9tW7BuibB0cnmQMkAicXXMTCEuyGEOn00IwrE3SMa1Efu8Kv6NzPEmRibbCsicxxNv5TdduIB69GS0bKqePuvA/640?wx_fmt=png&from=appmsg&tp=webp&wxfrom=5&wx_lazy=1&wx_co=1)



**这一方法使得系统更加具有弹性和适应性，能够处理现代工作流的复杂性。这不仅是一个技术突破；它还是在压力下系统生存的策略。**



### **早期社交巨头的兴衰**

早期社交网络如 Friendster 的兴衰强调了可扩展架构的重要性。Friendster 在早期吸引了大量用户，但他们的系统无法处理如此庞大的需求。性能问题使用户流失，平台最终失败。



相反，Facebook 的成功不仅因为其功能，还因为它投资了可扩展的基础设施。它没有在成功的重量下崩溃——反而挺立并最终主导了市场。



今天，我们也面临着一个类似的挑战——AI Agent 的兴起和发展。



与早期社交网络类似，代理将经历快速增长和广泛采用。构建代理本身并不足够，真正的问题在于你的架构是否能处理分布式数据、工具集成和多代理协作的复杂性。如果没有正确的基础，您的代理系统可能会像早期的社交媒体失败者一样崩溃。

### **未来是事件驱动的 Agent**

AI 的未来不仅仅是构建更智能的 Agent——更重要的是创建能够随着技术进步而进化和扩展的系统。随着 AI 堆栈和基础模型的快速变化，僵化的设计很快就会成为创新的障碍。为了跟上技术发展的步伐，我们需要优先考虑灵活性、适应性和无缝集成的架构。事件驱动架构（EDA）是这一未来的基础，它使得 Agent 能够在动态环境中蓬勃发展，同时保持弹性和可扩展性。

### **Agent 作为具有信息依赖的微服务**



Agent 类似于微服务：它们是自主的、解耦的，并能够独立处理任务。但代理更进一步。



虽然微服务通常处理离散的操作，但代理依赖于共享的、富有上下文的信息来进行推理、决策和协作。这就对管理依赖关系和确保实时数据流动提出了独特的要求。



例如，一个 Agent 可能从 CRM 中提取客户数据，分析实时分析数据，并使用外部工具——同时与其他 Agent 共享更新。这些交互需要一个系统，在该系统中，Agent 可以独立工作，但仍能流畅地交换关键信息。



EDA 通过充当“中央神经系统”来解决这一挑战。它允许 Agent 异步广播事件，确保信息动态流动而不会产生僵化的依赖关系。这种解耦让 Agent 能够自主操作，同时无缝集成到更广泛的工作流和系统中。



![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/SaeK9tW7BuibB0cnmQMkAicXXMTCEuyGEOWG4YLlr0pm5jcDKLicc0JlRAaSv3QW2AQekaVTdoIq9Vm3SRtwDZ8lA/640?wx_fmt=png&from=appmsg&tp=webp&wxfrom=5&wx_lazy=1&wx_co=1)

### **解耦同时保持上下文完整**

构建灵活的系统并不意味着要牺牲上下文。传统的紧密耦合设计通常将工作流绑定到特定的管道或技术上，迫使团队在瓶颈和依赖关系之间进行调整。一部分堆栈的变化会波及整个系统，减缓创新和扩展的步伐。



EDA 消除了这些限制。通过解耦工作流并启用异步通信，EDA 允许堆栈的不同部分——Agent、数据源、工具和应用层——独立运作。



以今天的 AI 堆栈为例。MLOps 团队管理像 RAG 这样的工作流，数据科学家选择模型，应用开发人员构建界面和后端。紧密耦合的设计迫使这些团队相互依赖，减缓交付并使适应新工具和技术变得更加困难。



相比之下，事件驱动的系统确保工作流保持松散耦合，使每个团队能够独立创新。

应用层不需要了解 AI 的内部细节——它们只在需要时消费结果。这种解耦还确保了 AI 的洞察不会被孤立。代理的输出可以无缝集成到 CRM、CDP、分析工具等中，创建一个统一的、可适应的生态系统。



### **通过事件驱动架构扩展 Agent**

EDA 是向 Agent 系统过渡的支柱。

它能够在解耦工作流的同时启用实时通信，确保代理能够在大规模下高效运作。如本文所讨论，像 Kafka 这样的平台展示了 EDA 在 Agent 驱动系统中的优势：

- **横向扩展性**：Kafka 的分布式设计支持添加新的 Agent 或消费者而不产生瓶颈，确保系统轻松扩展。
- **低延迟**：实时事件处理使 Agent 能够即时响应变化，确保快速和可靠的工作流。
- **松散耦合**：通过 Kafka 主题进行通信，而不是直接依赖，使 Agent 保持独立且可扩展。
- **事件持久化**：持久化消息存储确保在传输过程中不会丢失数据，这对高可靠性工作流至关重要。





![图片](https://mmbiz.qpic.cn/sz_mmbiz_png/SaeK9tW7BuibB0cnmQMkAicXXMTCEuyGEO7hbTbaLo3lPclZocKSn4PQeTz6icWOf2aayzWHAUtz5fz3g27ib3ibWiaw/640?wx_fmt=png&from=appmsg&tp=webp&wxfrom=5&wx_lazy=1&wx_co=1)



### **数据流使得数据能够在整个业务中持续流动。**



一个中央神经系统充当实时数据流的统一支柱，轻松连接不同的系统、应用程序和数据源，确保高效的 Agent 通信和决策制定。



这种架构与像 Anthropic 的 Model Context Protocol (MCP) 这样的框架自然契合。



MCP 提供了一个通用标准，用于将 AI 系统与外部工具、数据源和应用程序集成，确保安全且无缝地访问最新信息。通过简化这些连接，MCP 降低了开发工作量，同时启用了基于上下文的决策制定。



EDA 解决了许多 MCP 旨在解决的挑战。MCP 需要无缝访问多样的数据源、实时响应能力，并且能够扩展以支持复杂的多 Agent 工作流。通过解耦系统并启用异步通信，EDA 简化了集成，确保 Agent 能够在没有严格依赖关系的情况下消费和生成事件。

## **EDA 将定义 AI 的未来**  

AI 领域正在迅速发展，架构必须与之同步演变。



企业也已经准备好。Forum Ventures 的一项调查显示，48% 的 IT 高级领导者已准备好将 AI Agent 集成到运营中，其中 33% 表示他们非常准备好。这表明市场对于能够扩展并处理复杂性的系统有明显需求。



EDA 是构建灵活、韧性强、可扩展的代理系统的关键。它解耦组件，启用实时工作流，并确保 Agent 能够无缝地集成到更广泛的生态系统中。



那些采用 EDA 的企业不仅能生存下来——他们将在这波 AI 创新浪潮中获得竞争优势。而其余的企业，则有可能被抛在后面，成为因无法扩展而遭遇失败的牺牲品。





https://medium.com/@seanfalconer/the-future-of-ai-agents-is-event-driven-9e25124060d6