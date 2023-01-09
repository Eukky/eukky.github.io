---
title: UE5中的卡通渲染——自定义描边Pass
sidebar: false
categories:
  - UE
tags:
  - UE
  - Game Develop
  - Render
editLink: true
prev: false
next: false
---

# UE5中的卡通渲染——自定义描边Pass

上一篇讲了自定义Shading Model来在UE的材质中添加自己的光照模型，这次我们来讲讲如何在UE5的渲染管线中添加一个自定义的DrawPass来绘制法线扩张描边。

## 描边的绘制方法

绘制描边的方法多种多样，但是常见的描边绘制主要有两种思路，其一就是法线外扩的方式来绘制描边，另一种则是通过在后处理中进行边缘识别来绘制描边。

简单讲讲两者的区别和优劣，影响顶点法线外扩描边效果的因素主要来源于顶点法线的扩张角度，而影响后处理描边效果的因素则比较多样，在RT中选择写入Detph还是选择写入自定义的Stencil Bit，都会对后期的边缘识别效果产生影响，同时，选择使用的边缘识别算子也会对最终的效果产生影响，在后处理描边的具体细化方案中，还需结合自身需求来选择一种最合适的方案进行绘制。

这篇文章的主要目的是通过实现法线外扩描边功能来讲解UE5中的Draw Pass相关的原理和流程，因此暂时不会涉及到后处理描边的讲解，关于后处理描边，也许后面有时间了，也会尝试着做一做吧。

## Mesh Draw Pass的简单流程

添加一个Mesh Draw Pass主要需要实现三样东西

1. Mesh Draw Pass的Processor类
2. 定义VS和PS的类，以及Shader的实现
3. 调用RDG的Render函数

通过实现上述三种类或函数，再完成一些其他零散的修改和实现，即可完成自定义Pass的创建了。下面就来讲讲具体如何进行开发吧。

## Mesh Draw Pass的开发

首先还是一样，寻找定义Mesh Draw Pass的地方，在定义的枚举种添加我们自己的Pass名称

```C++
//MeshPassProcessor.h
namespace EMeshPass
{
	enum Type : uint8
	{
		DepthPass,
		BasePass,
		AnisotropyPass,
		SkyPass,
		SingleLayerWaterPass,
		SingleLayerWaterDepthPrepass,
		CSMShadowDepth,
		VSMShadowDepth,
		Distortion,
		Velocity,
		TranslucentVelocity,
		TranslucencyStandard,
		TranslucencyStandardModulate,
		TranslucencyAfterDOF,
		TranslucencyAfterDOFModulate,
		TranslucencyAfterMotionBlur,
		TranslucencyAll, /** Drawing all translucency, regardless of separate or standard.  Used when drawing translucency outside of the main renderer, eg FRendererModule::DrawTile. */
		LightmapDensity,
		DebugViewMode, /** Any of EDebugViewShaderMode */
		CustomDepth,
		MobileBasePassCSM,  /** Mobile base pass with CSM shading enabled */
		VirtualTexture,
		LumenCardCapture,
		LumenCardNanite,
		LumenTranslucencyRadianceCacheMark,
		LumenFrontLayerTranslucencyGBuffer,
		DitheredLODFadingOutMaskPass, /** A mini depth pass used to mark pixels with dithered LOD fading out. Currently only used by ray tracing shadows. */
		NaniteMeshPass,
		MeshDecal,

#if WITH_EDITOR
		HitProxy,
		HitProxyOpaqueOnly,
		EditorLevelInstance,
		EditorSelection,
#endif
		ToonOutlinePass,

		Num,
		NumBits = 6,
	};
}
```

接着创建一个新的头文件和一个新的CPP文件，用来存放新的Processor类和Shader类的实现，这一步同样可以仿照UE本身的Pass的实现，在UE本身的Pass种，参照Custom Depth Pass是一个不错的选择，流程清晰，代码量少。

首先在头文件中实现Processor类的声明，在这个类中主要包含一个构造函数和两个成员函数

```C++
//OutlinePassRendering.h
class FOutlinePassProcessor : public FMeshPassProcessor
{
public:
	FOutlinePassProcessor(
		const FScene* Scene,
		const FSceneView* InViewIfDynamicMeshCommand,
		const FMeshPassProcessorRenderState& InPassDrawRenderState,
		FMeshPassDrawListContext* InDrawListContext
	);

	virtual void AddMeshBatch(
		const FMeshBatch& RESTRICT MeshBatch,
		uint64 BatchElementMask,
		const FPrimitiveSceneProxy* RESTRICT PrimitiveSceneProxy,
		int32 StaticMeshId = -1
	) override final;

private:
	bool Process(
		const FMeshBatch& MeshBatch,
		uint64 BatchElementMask,
		int32 StaticMeshId,
		const FPrimitiveSceneProxy* RESTRICT PrimitiveSceneProxy,
		const FMaterialRenderProxy& RESTRICT MaterialRenderProxy,
		const FMaterial& RESTRICT MaterialResource,
		ERasterizerFillMode MeshFillMode,
		ERasterizerCullMode MeshCullMode
	);
	
	FMeshPassProcessorRenderState PassDrawRenderState;
};
```

接着是VS和PS两个Shader类的实现，由于目前尚未实现材质中获取描边参数的接口，可以暂时把下面代码中获取参数的代码注释掉，转而传给Shader一个定值来测试功能是否能够正常使用

```C++
//OutlinePassRendering.h
class FOutlineVS : public FMeshMaterialShader
{
	DECLARE_SHADER_TYPE(FOutlineVS, MeshMaterial);

public:
	FOutlineVS() = default;
	FOutlineVS(const ShaderMetaType::CompiledShaderInitializerType& Initializer)
		: FMeshMaterialShader(Initializer)
	{
		OutLineScale.Bind(Initializer.ParameterMap, TEXT("OutLineScale"));
	}

	static void ModifyCompilationEnvironment(const FMaterialShaderPermutationParameters& Parameters, FShaderCompilerEnvironment& OutEnvironment)
	{}

	static bool ShouldCompilePermutation(const FMeshMaterialShaderPermutationParameters& Parameters)
	{
		return IsFeatureLevelSupported(Parameters.Platform, ERHIFeatureLevel::SM5) &&
			Parameters.MaterialParameters.bHasOutline && 
			(Parameters.VertexFactoryType->GetFName() == FName(TEXT("FLocalVertexFactory")) || 
				Parameters.VertexFactoryType->GetFName() == FName(TEXT("TGPUSkinVertexFactoryDefault")));
	}

	void GetShaderBindings(
		const FScene* Scene,
		ERHIFeatureLevel::Type FeatureLevel,
		const FPrimitiveSceneProxy* PrimitiveSceneProxy,
		const FMaterialRenderProxy& MaterialRenderProxy,
		const FMaterial& Material,
		const FMeshPassProcessorRenderState& DrawRenderState,
		const FMeshMaterialShaderElementData& ShaderElementData,
		FMeshDrawSingleShaderBindings& ShaderBindings) const
	{
		FMeshMaterialShader::GetShaderBindings(Scene, FeatureLevel, PrimitiveSceneProxy, MaterialRenderProxy, Material, DrawRenderState, ShaderElementData, ShaderBindings);

		// const float OutlineScale = Material.GetOutlineScale();
		ShaderBindings.Add(OutLineScale, 1.0);
	}

	LAYOUT_FIELD(FShaderParameter, OutLineScale);
};


class FOutlinePS : public FMeshMaterialShader
{
	DECLARE_SHADER_TYPE(FOutlinePS, MeshMaterial);
	
public:

	FOutlinePS() = default;
	FOutlinePS(const ShaderMetaType::CompiledShaderInitializerType& Initializer)
		: FMeshMaterialShader(Initializer)
	{
		OutLineColor.Bind(Initializer.ParameterMap, TEXT("OutLineColor"));
	}

	static void ModifyCompilationEnvironment(const FMaterialShaderPermutationParameters& Parameters, FShaderCompilerEnvironment& OutEnvironment)
	{}

	static bool ShouldCompilePermutation(const FMeshMaterialShaderPermutationParameters& Parameters)
	{
		return IsFeatureLevelSupported(Parameters.Platform, ERHIFeatureLevel::SM5) &&
			Parameters.MaterialParameters.bHasOutline && 
			(Parameters.VertexFactoryType->GetFName() == FName(TEXT("FLocalVertexFactory")) || 
				Parameters.VertexFactoryType->GetFName() == FName(TEXT("TGPUSkinVertexFactoryDefault")));
	}
	
	void GetShaderBindings(
		const FScene* Scene,
		ERHIFeatureLevel::Type FeatureLevel,
		const FPrimitiveSceneProxy* PrimitiveSceneProxy,
		const FMaterialRenderProxy& MaterialRenderProxy,
		const FMaterial& Material,
		const FMeshPassProcessorRenderState& DrawRenderState,
		const FMeshMaterialShaderElementData& ShaderElementData,
		FMeshDrawSingleShaderBindings& ShaderBindings) const
	{
		FMeshMaterialShader::GetShaderBindings(Scene, FeatureLevel, PrimitiveSceneProxy, MaterialRenderProxy, Material, DrawRenderState, ShaderElementData, ShaderBindings);

		// const FLinearColor OutlineColor = Material.GetOutlineColor();
		FVector3f Color(1.0, 0.0, 0.0);

		ShaderBindings.Add(OutLineColor, Color);
	}
	
	LAYOUT_FIELD(FShaderParameter, OutLineColor);
};
```

整个Shader类的实现非常简单，主要可以分为以下几个部分

- `DECLARE_SHADER_TYPE`用于在UE中声明Shader的类型
- `LAYOUT_FIELD`用于声明Shader中能够传入的Uniform参数
- `ModifyCompilationEnvironment`用于在Shader中定义特定的宏
- `GetShaderBindings`用于绑定已经声明的Uniform参数

如此一来，Shader类这部分就基本算是完成了，但是也不要忘了在CPP文件中将对应的Shader文件绑定到这个Shader类上，这样在编译之后UE才能找到对应的Shader文件

```C++
//OutlinePassRendering.cpp
IMPLEMENT_MATERIAL_SHADER_TYPE(, FOutlineVS, TEXT("/Engine/Private/OutlinePassShader.usf"), TEXT("MainVS"), SF_Vertex);
IMPLEMENT_MATERIAL_SHADER_TYPE(, FOutlinePS, TEXT("/Engine/Private/OutlinePassShader.usf"), TEXT("MainPS"), SF_Pixel);
```

接下来则是对Processor中三个函数的实现，同样，下面的实现也注释掉了目前还没有在Material中完成的接口部分

```C++
//OutlinePassRendering.cpp
FOutlinePassProcessor::FOutlinePassProcessor(
	const FScene* Scene,
	const FSceneView* InViewIfDynamicMeshCommand,
	const FMeshPassProcessorRenderState& InPassDrawRenderState,
	FMeshPassDrawListContext* InDrawListContext)
:FMeshPassProcessor(Scene, Scene->GetFeatureLevel(), InViewIfDynamicMeshCommand, InDrawListContext),
PassDrawRenderState(InPassDrawRenderState)
{
	// PassDrawRenderState.SetViewUniformBuffer(Scene->UniformBuffers.ViewUniform);
	if (PassDrawRenderState.GetDepthStencilState() == nullptr)
	{
		PassDrawRenderState.SetDepthStencilState(TStaticDepthStencilState<false, CF_NotEqual>().GetRHI());
	}
	if (PassDrawRenderState.GetBlendState() == nullptr)
	{
		PassDrawRenderState.SetBlendState(TStaticBlendState<>().GetRHI());
	}
}

void FOutlinePassProcessor::AddMeshBatch(
	const FMeshBatch& MeshBatch,
	uint64 BatchElementMask,
	const FPrimitiveSceneProxy* PrimitiveSceneProxy,
	int32 StaticMeshId)
{
	const FMaterialRenderProxy* MaterialRenderProxy = MeshBatch.MaterialRenderProxy;
	const FMaterialRenderProxy* FallBackMaterialRenderProxyPtr = nullptr;
	const FMaterial* Material = MaterialRenderProxy->GetMaterialNoFallback(FeatureLevel);
	
	// only set in Material will draw outline
	if (Material != nullptr && Material->GetRenderingThreadShaderMap() /*&& Material->HasOutline()*/)
	{
		// Determine the mesh's material and blend mode.
		const EBlendMode BlendMode = Material->GetBlendMode();

		bool bResult = true;
		if (BlendMode == BLEND_Opaque)
		{
			Process(
				MeshBatch,
				BatchElementMask,
				StaticMeshId,
				PrimitiveSceneProxy,
				*MaterialRenderProxy,
				*Material,
				FM_Solid,
				CM_CCW);
		}
	}
}

bool FOutlinePassProcessor::Process(
	const FMeshBatch& MeshBatch,
	uint64 BatchElementMask,
	int32 StaticMeshId,
	const FPrimitiveSceneProxy* PrimitiveSceneProxy,
	const FMaterialRenderProxy& MaterialRenderProxy,
	const FMaterial& RESTRICT MaterialResource,
	ERasterizerFillMode MeshFillMode,
	ERasterizerCullMode MeshCullMode)
{
	const FVertexFactory* VertexFactory = MeshBatch.VertexFactory;

	TMeshProcessorShaders<FOutlineVS, FOutlinePS> OutlineShaders;
	
	{
		FMaterialShaderTypes ShaderTypes;
		ShaderTypes.AddShaderType<FOutlineVS>();
		ShaderTypes.AddShaderType<FOutlinePS>();
	
		const FVertexFactoryType* VertexFactoryType = VertexFactory->GetType();
	
		FMaterialShaders Shaders;
		if (!MaterialResource.TryGetShaders(ShaderTypes, VertexFactoryType, Shaders))
		{
			UE_LOG(LogShaders, Warning, TEXT("Shader Not Found!"));
			return false;
		}
	
		Shaders.TryGetVertexShader(OutlineShaders.VertexShader);
		Shaders.TryGetPixelShader(OutlineShaders.PixelShader);
	}

	
	FMeshMaterialShaderElementData ShaderElementData;
	ShaderElementData.InitializeMeshMaterialData(ViewIfDynamicMeshCommand, PrimitiveSceneProxy, MeshBatch, StaticMeshId, false);

	const FMeshDrawCommandSortKey SortKey = CalculateMeshStaticSortKey(OutlineShaders.VertexShader, OutlineShaders.PixelShader);

	PassDrawRenderState.SetDepthStencilState(
	TStaticDepthStencilState<
	true, CF_GreaterEqual,// Enable DepthTest, It reverse about OpenGL(which is less)
	false, CF_Never, SO_Keep, SO_Keep, SO_Keep,
	false, CF_Never, SO_Keep, SO_Keep, SO_Keep,// enable stencil test when cull back
	0x00,// disable stencil read
	0x00>// disable stencil write
	::GetRHI());
	PassDrawRenderState.SetStencilRef(0);
	
	BuildMeshDrawCommands(
		MeshBatch,
		BatchElementMask,
		PrimitiveSceneProxy,
		MaterialRenderProxy,
		MaterialResource,
		PassDrawRenderState,
		OutlineShaders,
		MeshFillMode,
		MeshCullMode,
		SortKey,
		EMeshPassFeatures::Default,
		ShaderElementData
	);
	
	return true;
}
```

这段代码看似复杂，实在主要完成了以下几个部分的功能

- 构造函数中主要完成对渲染状态的重置和清零
- 在`AddMeshBatch`中，则主要用来收集需要在该Pass中进行绘制的Mesh，同时调用`Process`函数，实现主要的功能
- 在`Process`中，主要完成了以下几件事情，获取Shader，设置渲染状态，以及调用`BuildMeshDrawCommands`构建渲染指令，而这些渲染指令则是最终我们在RDG中去执行的渲染指令

UE对图形渲染的实现做了很多封装，同时又因为其自身管线的复杂程度，导致其自身的工程实现非常重，但是从另一方面来看，在实现了上述的Processor之后，渲染所需要的准备就基本上算是完成了，你会发现在实现的过程中并没有接触到图形API相关的概念，而是把注意力集中到了对Mesh的处理以及对渲染状态的处理上，所以UE的这套管线封装，在我看来有利有弊，也算是一把双刃剑吧。

但是仅仅是这样子还远远不能让这个Pass跑起来，我们还需要再添加一些另外的东西。

首先是这个Processor的注册

```C++
//OutlinePassRendering.cpp
void SetupOutlinePassState(FMeshPassProcessorRenderState& DrawRenderState)
{
	DrawRenderState.SetDepthStencilState(TStaticDepthStencilState<true, CF_LessEqual>().GetRHI());
}

FMeshPassProcessor* CreateOutlinePassProcessor(const FScene* Scene, const FSceneView* InViewIfDynamicMeshCommand, FMeshPassDrawListContext* InDrawListContext)
{
	FMeshPassProcessorRenderState OutlinePassState;
	SetupOutlinePassState(OutlinePassState);
	return new FOutlinePassProcessor(Scene, InViewIfDynamicMeshCommand, OutlinePassState, InDrawListContext);
}

FRegisterPassProcessorCreateFunction RegisterOutlinePass(&CreateOutlinePassProcessor, EShadingPath::Deferred, EMeshPass::OutlinePass, EMeshPassFlags::CachedMeshCommands | EMeshPassFlags::MainView);
```

在注册完成之后，UE会替我们去创建这个Processor，而不需要我们自己去构造这个Processor的实例对象了

接着，在DeferredShadingRenderer中声明Render函数

```C++
//DeferredShadingRenderer.h
void RenderPrePass(FRDGBuilder& GraphBuilder, FRDGTextureRef SceneDepthTexture, FInstanceCullingManager& InstanceCullingManager);
void RenderPrePassHMD(FRDGBuilder& GraphBuilder, FRDGTextureRef SceneDepthTexture);

void RenderOutlinePass(FRDGBuilder& GraphBuilder, FSceneTextures& SceneTextures);

void RenderFog(
    FRDGBuilder& GraphBuilder,
    const FMinimalSceneTextures& SceneTextures,
    FRDGTextureRef LightShaftOcclusionTexture);
```

将Render的函数依旧放入Processor的CPP文件中，由于需要在RDG中传入绘制所需要的View以及SceneTexture，在此处还需使用Shader宏来定义UniformBuffer，以便传入绘制所需要的参数

```C++
//OutlinePassRendering.cpp
DECLARE_CYCLE_STAT(TEXT("OutlinePass"), STAT_CLP_OutlinePass, STATGROUP_ParallelCommandListMarkers);

BEGIN_SHADER_PARAMETER_STRUCT(FOutlineMeshPassParameters, )
	SHADER_PARAMETER_STRUCT_REF(FViewUniformShaderParameters, View)
	SHADER_PARAMETER_STRUCT_INCLUDE(FInstanceCullingDrawParams, InstanceCullingDrawParams)
	RENDER_TARGET_BINDING_SLOTS()
END_SHADER_PARAMETER_STRUCT()

FOutlineMeshPassParameters* GetOutlinePassParameters(FRDGBuilder& GraphBuilder, const FViewInfo& View, FSceneTextures& SceneTextures)
{
	FOutlineMeshPassParameters* PassParameters = GraphBuilder.AllocParameters<FOutlineMeshPassParameters>();
	PassParameters->View = View.ViewUniformBuffer;

	PassParameters->RenderTargets[0] = FRenderTargetBinding(SceneTextures.Color.Target, ERenderTargetLoadAction::ELoad);
	PassParameters->RenderTargets.DepthStencil = FDepthStencilBinding(SceneTextures.Depth.Target, ERenderTargetLoadAction::ELoad, ERenderTargetLoadAction::ELoad, FExclusiveDepthStencil::DepthWrite_StencilWrite);

	return PassParameters;
}


void FDeferredShadingSceneRenderer::RenderOutlinePass(FRDGBuilder& GraphBuilder, FSceneTextures& SceneTextures)
{
	RDG_EVENT_SCOPE(GraphBuilder, "OutlinePass");
	RDG_CSV_STAT_EXCLUSIVE_SCOPE(GraphBuilder, RenderOutlinePass);

	SCOPED_NAMED_EVENT(FDeferredShadingSceneRenderer_RenderOutlinePass, FColor::Emerald);

	for(int32 ViewIndex = 0; ViewIndex < Views.Num(); ++ViewIndex)
	{
		FViewInfo& View = Views[ViewIndex];
		RDG_GPU_MASK_SCOPE(GraphBuilder, View.GPUMask);
		RDG_EVENT_SCOPE_CONDITIONAL(GraphBuilder, Views.Num() > 1, "View%d", ViewIndex);

		const bool bShouldRenderView = View.ShouldRenderView();
		if(bShouldRenderView)
		{
			FOutlineMeshPassParameters* PassParameters = GetOutlinePassParameters(GraphBuilder, View, SceneTextures);
			
			View.ParallelMeshDrawCommandPasses[EMeshPass::OutlinePass].BuildRenderingCommands(GraphBuilder, Scene->GPUScene, PassParameters->InstanceCullingDrawParams);

			GraphBuilder.AddPass(
				RDG_EVENT_NAME("OutlinePass"),
				PassParameters,
				ERDGPassFlags::Raster | ERDGPassFlags::SkipRenderPass,
				[this, &View, PassParameters](const FRDGPass* InPass, FRHICommandListImmediate& RHICmdList)
			{
				FRDGParallelCommandListSet ParallelCommandListSet(InPass, RHICmdList, GET_STATID(STAT_CLP_OutlinePass), *this, View, FParallelCommandListBindings(PassParameters));
				ParallelCommandListSet.SetHighPriority();
				SetStereoViewport(RHICmdList, View, 1.0f);
				View.ParallelMeshDrawCommandPasses[EMeshPass::OutlinePass].DispatchDraw(&ParallelCommandListSet, RHICmdList, &PassParameters->InstanceCullingDrawParams);
			});
		}
	}
}
```

接着，还需要在可见相关性函数中添加渲染指令的构建条件，这里同样注释掉还未实现的接口部分，以方便测试功能

```C++
//SceneVisibility.cpp
// if (StaticMeshRelevance.bHasOutline)
{
    DrawCommandPacket.AddCommandsForMesh(PrimitiveIndex, PrimitiveSceneInfo, StaticMeshRelevance, StaticMesh, Scene, bCanCache, EMeshPass::OutlinePass);
}

if (StaticMeshRelevance.bUseAnisotropy)
{
    DrawCommandPacket.AddCommandsForMesh(PrimitiveIndex, PrimitiveSceneInfo, StaticMeshRelevance, StaticMesh, Scene, bCanCache, EMeshPass::AnisotropyPass);
}
```

最后，在Render主函数中调用刚刚实现的Render函数，即可看到添加的自定义Pass运行起来了

```C++
//DeferredShadingRenderer.cpp
RenderOutlinePass(GraphBuilder, SceneTextures);

AddSubsurfacePass(GraphBuilder, SceneTextures, Views);

Strata::AddStrataOpaqueRoughRefractionPasses(GraphBuilder, SceneTextures, Views);

{
    RenderHairStrandsSceneColorScattering(GraphBuilder, SceneTextures.Color.Target, Scene, Views);
}
```

到这里，描边绘制的功能显然是不完善的，那么下一篇就继续讲讲，如何针对这个功能，做一些编辑器的定制吧。