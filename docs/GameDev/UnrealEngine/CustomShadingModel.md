---
title: UE5中的卡通渲染——自定义Shading Model
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

# UE5中的卡通渲染——自定义Shading Model

虽然距离上一次投稿已经过去了好久，在这段时间里面，我也尝试了去用UE5自定义一些渲染管线来实现卡通渲染，虽然知乎上已经有非常多的大佬已经讲过了这些东西，但是由于我的开发分支是跟随着ue5-main的分支一起开发的，期间还是遇到了一些别人文章中没有遇到的坑。如果有小伙伴也想实时跟随着官方的进度一起在主开发分支进行开发，在开发的同时能够第一时间尝鲜到官方制作的新功能以及新Bug，那么可以参考一下，我遇到的坑里面，有没有一些对你能够产生帮助的东西。

## Shading Model的简单原理

开发一个新的着色模型最直接的方式就是去添加一个自定义的Shading Model了。由于知乎上已经有太多的文章直接展示了如何去扩展一个Shading Model的代码，我在实践的过程中也参考了其中不少，但是鲜有文章能够简单的讲解一下UE的内部一个Shading Model是如何生效的，其中的原理又分为哪几步，那么这里就基于我自己的实践简单讲讲吧。

一个Shading Model需要生效，到最终在材质中去表现出来，简单来说需要以下这么几步

1. 在母材质中选中需要使用的Shading Model
2. 在选中之后，该Shading Model的值会被传入到材质的输入参数`PixelMaterialInputs`中，以便在PS中获取这个参数
3. 由于是延迟渲染，同时，该Shading Model的值也会通过`SetGBufferForShadingModel`函数被传入到GBuffer
4. 在处理完参数的输入之后，最终在光照计算的`IntegrateBxDF`函数里面根据传入的Shading Model的值来选择对应的BxDF函数来进行光照计算
5. 最后就是执行我们自定义的BxDF的光照计算了

通过上述步骤，就可以让一个Shading Model所定义的光照计算最终被材质调用，在画面中表现出来。

## Shading Model的开发

理清了上述步骤，Shading Model的开发步骤已经变得非常清晰。

首先需要在母材质的编辑器中添加我们新的Shading Model选项，只需要在`EMaterialShadingModel`中添加对应的枚举值即可

```C++
//EngineTypes.h
UENUM()
enum EMaterialShadingModel : int
{
	MSM_Unlit					UMETA(DisplayName="Unlit"),
	MSM_DefaultLit				UMETA(DisplayName="Default Lit"),
	MSM_Subsurface				UMETA(DisplayName="Subsurface"),
	MSM_PreintegratedSkin		UMETA(DisplayName="Preintegrated Skin"),
	MSM_ClearCoat				UMETA(DisplayName="Clear Coat"),
	MSM_SubsurfaceProfile		UMETA(DisplayName="Subsurface Profile"),
	MSM_TwoSidedFoliage			UMETA(DisplayName="Two Sided Foliage"),
	MSM_Hair					UMETA(DisplayName="Hair"),
	MSM_Cloth					UMETA(DisplayName="Cloth"),
	MSM_Eye						UMETA(DisplayName="Eye"),
	MSM_SingleLayerWater		UMETA(DisplayName="SingleLayerWater"),
	MSM_ThinTranslucent			UMETA(DisplayName="Thin Translucent"),
	MSM_Strata					UMETA(DisplayName="Strata", Hidden),
	MSM_Toon					UMETA(DisplayName="Toon"),
	/** Number of unique shading models. */
	MSM_NUM						UMETA(Hidden),
	/** Shading model will be determined by the Material Expression Graph,
		by utilizing the 'Shading Model' MaterialAttribute output pin. */
	MSM_FromMaterialExpression	UMETA(DisplayName="From Material Expression"),
	MSM_MAX
};
```

增加了定义之后，一切都变得简单了起来，俗话说的好，UE的开发就是照葫芦画瓢，我们只需要随意在上面选择另外一个Shading Model，然后全局搜索，在搜索结果中照抄就好。

添加枚举转字符串

```C++
//MaterialShader.cpp
FString GetShadingModelString(EMaterialShadingModel ShadingModel)
{
	FString ShadingModelName;
	switch(ShadingModel)
	{
		case MSM_Unlit:				ShadingModelName = TEXT("MSM_Unlit"); break;
		case MSM_DefaultLit:		ShadingModelName = TEXT("MSM_DefaultLit"); break;
		case MSM_Subsurface:		ShadingModelName = TEXT("MSM_Subsurface"); break;
		case MSM_PreintegratedSkin:	ShadingModelName = TEXT("MSM_PreintegratedSkin"); break;
		case MSM_ClearCoat:			ShadingModelName = TEXT("MSM_ClearCoat"); break;
		case MSM_SubsurfaceProfile:	ShadingModelName = TEXT("MSM_SubsurfaceProfile"); break;
		case MSM_TwoSidedFoliage:	ShadingModelName = TEXT("MSM_TwoSidedFoliage"); break;
		case MSM_Hair:				ShadingModelName = TEXT("MSM_Hair"); break;
		case MSM_Cloth:				ShadingModelName = TEXT("MSM_Cloth"); break;
		case MSM_Eye:				ShadingModelName = TEXT("MSM_Eye"); break;
		case MSM_SingleLayerWater:	ShadingModelName = TEXT("MSM_SingleLayerWater"); break;
		case MSM_ThinTranslucent:	ShadingModelName = TEXT("MSM_ThinTranslucent"); break;
		case MSM_Toon:				ShadingModelName = TEXT("MSM_Toon"); break;
		default: ShadingModelName = TEXT("Unknown"); break;
	}
	return ShadingModelName;
}
```

添加Shader中的宏定义

```C++
//HLSLMaterialTranslator.cpp
if (ShadingModels.HasShadingModel(MSM_SingleLayerWater))
{
    OutEnvironment.SetDefine(TEXT("MATERIAL_SHADINGMODEL_SINGLELAYERWATER"), TEXT("1"));
    NumSetMaterials++;
}
if (ShadingModels.HasShadingModel(MSM_ThinTranslucent))
{
    OutEnvironment.SetDefine(TEXT("MATERIAL_SHADINGMODEL_THIN_TRANSLUCENT"), TEXT("1"));
    NumSetMaterials++;

    bMaterialRequestsDualSourceBlending = true;
}

if (ShadingModels.HasShadingModel(MSM_Toon)) 
{
    OutEnvironment.SetDefine(TEXT("MATERIAL_SHADINGMODEL_TOON"), TEXT("1"));
    NumSetMaterials++;
}

if (ShadingModels.HasShadingModel(MSM_SingleLayerWater) && FDataDrivenShaderPlatformInfo::GetRequiresDisableForwardLocalLights(Platform))
{
    OutEnvironment.SetDefine(TEXT("DISABLE_FORWARD_LOCAL_LIGHTS"), TEXT("1"));
}
```

```C++
//ShaderMaterial.h
struct FShaderMaterialPropertyDefines
{
	//DECLARE_TYPE_LAYOUT(FShaderMaterialPropertyDefines, NonVirtual);

	//void ModifyEnvironment(FShaderCompilerEnvironment& OutEnvironment) const;
	//void WriteFrozenVertexFactoryParameters(FMemoryImageWriter& Writer, const TMemoryImagePtr<FShaderMaterialPropertyDefines>& InPropDefines) const;

	uint8 MATERIAL_ENABLE_TRANSLUCENCY_FOGGING : 1;

	uint8 MATERIALBLENDING_ANY_TRANSLUCENT : 1;
	uint8 MATERIAL_USES_SCENE_COLOR_COPY : 1;
	uint8 MATERIALBLENDING_MASKED_USING_COVERAGE : 1;

	uint8 MATERIAL_COMPUTE_FOG_PER_PIXEL : 1;
	uint8 MATERIAL_SHADINGMODEL_UNLIT : 1;

	uint8 MATERIAL_SHADINGMODEL_DEFAULT_LIT : 1;
	uint8 MATERIAL_SHADINGMODEL_SUBSURFACE : 1;
	uint8 MATERIAL_SHADINGMODEL_PREINTEGRATED_SKIN : 1;
	uint8 MATERIAL_SHADINGMODEL_SUBSURFACE_PROFILE : 1;
	uint8 MATERIAL_SHADINGMODEL_CLEAR_COAT : 1;
	uint8 MATERIAL_SHADINGMODEL_TWOSIDED_FOLIAGE : 1;
	uint8 MATERIAL_SHADINGMODEL_HAIR : 1;
	uint8 MATERIAL_SHADINGMODEL_CLOTH : 1;
	uint8 MATERIAL_SHADINGMODEL_EYE : 1;
	uint8 MATERIAL_SHADINGMODEL_SINGLELAYERWATER : 1;
	uint8 SINGLE_LAYER_WATER_SEPARATED_MAIN_LIGHT : 1;
	uint8 MATERIAL_SHADINGMODEL_THIN_TRANSLUCENT : 1;

	uint8 MATERIAL_SHADINGMODEL_TOON : 1;
```

添加Shader生成代码

```C++
//ShaderGenerationUtil.cpp
void FShaderCompileUtilities::ApplyFetchEnvironment(FShaderMaterialPropertyDefines& SrcDefines, FShaderCompilerEnvironment& OutEnvironment)
{
	FETCH_COMPILE_BOOL(MATERIAL_ENABLE_TRANSLUCENCY_FOGGING);
	FETCH_COMPILE_BOOL(MATERIALBLENDING_ANY_TRANSLUCENT);
	FETCH_COMPILE_BOOL(MATERIAL_USES_SCENE_COLOR_COPY);
	FETCH_COMPILE_BOOL(MATERIALBLENDING_MASKED_USING_COVERAGE);

	FETCH_COMPILE_BOOL(MATERIAL_COMPUTE_FOG_PER_PIXEL);
	FETCH_COMPILE_BOOL(MATERIAL_SHADINGMODEL_UNLIT);

	FETCH_COMPILE_BOOL(MATERIAL_SHADINGMODEL_DEFAULT_LIT);
	FETCH_COMPILE_BOOL(MATERIAL_SHADINGMODEL_SUBSURFACE);
	FETCH_COMPILE_BOOL(MATERIAL_SHADINGMODEL_PREINTEGRATED_SKIN);
	FETCH_COMPILE_BOOL(MATERIAL_SHADINGMODEL_SUBSURFACE_PROFILE);
	FETCH_COMPILE_BOOL(MATERIAL_SHADINGMODEL_CLEAR_COAT);
	FETCH_COMPILE_BOOL(MATERIAL_SHADINGMODEL_TWOSIDED_FOLIAGE);
	FETCH_COMPILE_BOOL(MATERIAL_SHADINGMODEL_HAIR);
	FETCH_COMPILE_BOOL(MATERIAL_SHADINGMODEL_CLOTH);
	FETCH_COMPILE_BOOL(MATERIAL_SHADINGMODEL_EYE);
	FETCH_COMPILE_BOOL(MATERIAL_SHADINGMODEL_SINGLELAYERWATER);
	FETCH_COMPILE_BOOL(MATERIAL_SHADINGMODEL_THIN_TRANSLUCENT);

	FETCH_COMPILE_BOOL(MATERIAL_SHADINGMODEL_TOON);

	FETCH_COMPILE_BOOL(SINGLE_LAYER_WATER_SEPARATED_MAIN_LIGHT);

	FETCH_COMPILE_BOOL(MATERIAL_FULLY_ROUGH);

	FETCH_COMPILE_BOOL(USES_EMISSIVE_COLOR);
```

如果我们的Shader Model需要使用额外的的数据，也可以将这些参数通过CustomData进行传入，同时修改材质节点的引脚

在该Shading Model下激活Custom引脚

```C++
//Material.cpp
case MP_Normal:
    Active = (ShadingModels.IsLit() && (!bIsTranslucentBlendMode || !bIsNonDirectionalTranslucencyLightingMode)) || bUsesDistortion;
    break;
case MP_Tangent:
    Active = ShadingModels.HasAnyShadingModel({ MSM_DefaultLit, MSM_ClearCoat }) && (!bIsTranslucentBlendMode || !bIsVolumetricTranslucencyLightingMode);
    break;
case MP_SubsurfaceColor:
    Active = ShadingModels.HasAnyShadingModel({ MSM_Subsurface, MSM_PreintegratedSkin, MSM_TwoSidedFoliage, MSM_Cloth });
    break;
case MP_CustomData0:
    Active = ShadingModels.HasAnyShadingModel({ MSM_ClearCoat, MSM_Hair, MSM_Cloth, MSM_Eye, MSM_SubsurfaceProfile, MSM_Toon });
    break;
case MP_CustomData1:
    Active = ShadingModels.HasAnyShadingModel({ MSM_ClearCoat, MSM_Eye, MSM_Toon });
    break;
```

增加新的引脚，这段代码原本是放在MaterialShared.cpp文件下，但是目前主开发分支最新的版本已经把这些都移到了MaterialAttributeDefinitionMap.cpp下面（导致我合代码时不注意，导致疯狂报重定义编译失败）

```C++
//MaterialShared.cpp/MaterialAttributeDefinitionMap.cpp
case MP_CustomData0:	
    CustomPinNames.Add({ MSM_ClearCoat, "Clear Coat" });
    CustomPinNames.Add({MSM_Hair, "Backlit"});
    CustomPinNames.Add({MSM_Cloth, "Cloth"});
    CustomPinNames.Add({MSM_Eye, "Iris Mask"});
    CustomPinNames.Add({MSM_SubsurfaceProfile, "Curvature" });

    CustomPinNames.Add({ MSM_Toon, "Specular Range" });
    return FText::FromString(GetPinNameFromShadingModelField(Material->GetShadingModels(), CustomPinNames, "Custom Data 0"));
case MP_CustomData1:
    CustomPinNames.Add({ MSM_ClearCoat, "Clear Coat Roughness" });
    CustomPinNames.Add({MSM_Eye, "Iris Distance"});
  
    CustomPinNames.Add({ MSM_Toon, "Offset" });
    return FText::FromString(GetPinNameFromShadingModelField(Material->GetShadingModels(), CustomPinNames, "Custom Data 1"));
```

将CustomData写入GBuffer

```C++
//ShaderGenerationUtil.cpp
if (Mat.MATERIAL_SHADINGMODEL_EYE)
{
    SetStandardGBufferSlots(Slots, bWriteEmissive, bHasTangent, bHasVelocity, bHasStaticLighting, bIsStrataMaterial);
    Slots[GBS_CustomData] = bUseCustomData;
}

if (Mat.MATERIAL_SHADINGMODEL_SINGLELAYERWATER)
{
    // single layer water uses standard slots
    SetStandardGBufferSlots(Slots, bWriteEmissive, bHasTangent, bHasVelocity, bHasStaticLighting, bIsStrataMaterial);
    if (Mat.SINGLE_LAYER_WATER_SEPARATED_MAIN_LIGHT)
    {
        Slots[GBS_SeparatedMainDirLight] = true;
    }
}

// doesn't write to GBuffer
if (Mat.MATERIAL_SHADINGMODEL_THIN_TRANSLUCENT)
{
}
if (Mat.MATERIAL_SHADINGMODEL_TOON)
{
    SetStandardGBufferSlots(Slots, bWriteEmissive, bHasTangent, bHasVelocity, bHasStaticLighting, bIsStrataMaterial);
    Slots[GBS_CustomData] = bUseCustomData;
}
```

```C++
//ShaderMaterialDerivedHelpers.cpp
Dst.NEEDS_LIGHTMAP = (Dst.NEEDS_LIGHTMAP_COORDINATE) && !Lightmap.PRECOMPUTED_IRRADIANCE_VOLUME_LIGHTING;

Dst.USES_GBUFFER = (FEATURE_LEVEL >= ERHIFeatureLevel::SM4_REMOVED && (Mat.MATERIALBLENDING_SOLID || Mat.MATERIALBLENDING_MASKED) && !SrcGlobal.FORWARD_SHADING);

// Only some shader models actually need custom data.
Dst.WRITES_CUSTOMDATA_TO_GBUFFER = (Dst.USES_GBUFFER && (Mat.MATERIAL_SHADINGMODEL_SUBSURFACE || Mat.MATERIAL_SHADINGMODEL_PREINTEGRATED_SKIN || Mat.MATERIAL_SHADINGMODEL_SUBSURFACE_PROFILE || Mat.MATERIAL_SHADINGMODEL_CLEAR_COAT || Mat.MATERIAL_SHADINGMODEL_TWOSIDED_FOLIAGE || Mat.MATERIAL_SHADINGMODEL_HAIR || Mat.MATERIAL_SHADINGMODEL_CLOTH || Mat.MATERIAL_SHADINGMODEL_EYE || Mat.MATERIAL_SHADINGMODEL_TOON));
```

那么C++部分的改动到此基本就结束了，从结果来看，我们在材质编辑器中增加了一个Shading Model的选项，同时在选中这个Shading Model的时候，会出现两个自定义的引脚，这两个引脚会通过CustomData把参数传到Shader当中供我们在计算时候使用。

接下来时Shader的部分，首先同样是照葫芦画瓢，我们可以通过全局搜索其他Shading Model的名称，把一些定义先加上

```C++
//Definitions.usf
#if STRATA_NORMAL_QUALITY==0
#define STRATA_TOP_LAYER_TYPE uint
#elif STRATA_NORMAL_QUALITY==1
#define STRATA_TOP_LAYER_TYPE uint2
#else
#error Uknown STRATA_NORMAL_QUALITY
#endif

#ifndef MATERIAL_SHADINGMODEL_DEFAULT_LIT
#define MATERIAL_SHADINGMODEL_DEFAULT_LIT				0
#endif

#ifndef MATERIAL_SHADINGMODEL_TOON
#define MATERIAL_SHADINGMODEL_TOON						0
#endif

#ifndef MATERIAL_SHADINGMODEL_SUBSURFACE
#define MATERIAL_SHADINGMODEL_SUBSURFACE				0
#endif

#ifndef MATERIAL_SHADINGMODEL_PREINTEGRATED_SKIN
#define MATERIAL_SHADINGMODEL_PREINTEGRATED_SKIN		0
#endif
```

添加Shading Model ID，同时定义在View中Debug的颜色

```C++
//ShadingCommon.ush
// SHADINGMODELID_* occupy the 4 low bits of an 8bit channel and SKIP_* occupy the 4 high bits
#define SHADINGMODELID_UNLIT				0
#define SHADINGMODELID_DEFAULT_LIT			1
#define SHADINGMODELID_SUBSURFACE			2
#define SHADINGMODELID_PREINTEGRATED_SKIN	3
#define SHADINGMODELID_CLEAR_COAT			4
#define SHADINGMODELID_SUBSURFACE_PROFILE	5
#define SHADINGMODELID_TWOSIDED_FOLIAGE		6
#define SHADINGMODELID_HAIR					7
#define SHADINGMODELID_CLOTH				8
#define SHADINGMODELID_EYE					9
#define SHADINGMODELID_SINGLELAYERWATER		10
#define SHADINGMODELID_THIN_TRANSLUCENT		11
#define SHADINGMODELID_STRATA				12		// Temporary while we convert everything to Strata
#define SHADINGMODELID_TOON					13
#define SHADINGMODELID_NUM					14
#define SHADINGMODELID_MASK					0xF		// 4 bits reserved for ShadingModelID			

// The flags are defined so that 0 value has no effect!
// These occupy the 4 high bits in the same channel as the SHADINGMODELID_*
#define HAS_ANISOTROPY_MASK				(1 << 4)
#define SKIP_PRECSHADOW_MASK			(1 << 5)
#define ZERO_PRECSHADOW_MASK			(1 << 6)
#define SKIP_VELOCITY_MASK				(1 << 7)

#define SSS_PROFILE_ID_INVALID  256
#define SSS_PROFILE_ID_PERPIXEL 512

// for debugging and to visualize
float3 GetShadingModelColor(uint ShadingModelID)
{
	// TODO: PS4 doesn't optimize out correctly the switch(), so it thinks it needs all the Samplers even if they get compiled out
	//	This will get fixed after launch per Sony...
#if PS4_PROFILE
		 if (ShadingModelID == SHADINGMODELID_UNLIT) return float3(0.1f, 0.1f, 0.2f); // Dark Blue
	else if (ShadingModelID == SHADINGMODELID_DEFAULT_LIT) return float3(0.1f, 1.0f, 0.1f); // Green
	else if (ShadingModelID == SHADINGMODELID_SUBSURFACE) return float3(1.0f, 0.1f, 0.1f); // Red
	else if (ShadingModelID == SHADINGMODELID_PREINTEGRATED_SKIN) return float3(0.6f, 0.4f, 0.1f); // Brown
	else if (ShadingModelID == SHADINGMODELID_CLEAR_COAT) return float3(0.1f, 0.4f, 0.4f); 
	else if (ShadingModelID == SHADINGMODELID_SUBSURFACE_PROFILE) return float3(0.2f, 0.6f, 0.5f); // Cyan
	else if (ShadingModelID == SHADINGMODELID_TWOSIDED_FOLIAGE) return float3(0.2f, 0.2f, 0.8f); // Blue
	else if (ShadingModelID == SHADINGMODELID_HAIR) return float3(0.6f, 0.1f, 0.5f);
	else if (ShadingModelID == SHADINGMODELID_CLOTH) return float3(0.7f, 1.0f, 1.0f); 
	else if (ShadingModelID == SHADINGMODELID_EYE) return float3(0.3f, 1.0f, 1.0f); 
	else if (ShadingModelID == SHADINGMODELID_SINGLELAYERWATER) return float3(0.5f, 0.5f, 1.0f);
	else if (ShadingModelID == SHADINGMODELID_THIN_TRANSLUCENT) return float3(1.0f, 0.8f, 0.3f);
	else if (ShadingModelID == SHADINGMODELID_STRATA) return float3(1.0f, 1.0f, 0.0f);
	else if (ShadingModelID == SHADINGMODELID_TOON) return float3(0.75f, 0.1f, 0.1f);
	else return float3(1.0f, 1.0f, 1.0f); // White
#else
	switch(ShadingModelID)
	{
		case SHADINGMODELID_UNLIT: return float3(0.1f, 0.1f, 0.2f); // Dark Blue
		case SHADINGMODELID_DEFAULT_LIT: return float3(0.1f, 1.0f, 0.1f); // Green
		case SHADINGMODELID_SUBSURFACE: return float3(1.0f, 0.1f, 0.1f); // Red
		case SHADINGMODELID_PREINTEGRATED_SKIN: return float3(0.6f, 0.4f, 0.1f); // Brown
		case SHADINGMODELID_CLEAR_COAT: return float3(0.1f, 0.4f, 0.4f); // Brown
		case SHADINGMODELID_SUBSURFACE_PROFILE: return float3(0.2f, 0.6f, 0.5f); // Cyan
		case SHADINGMODELID_TWOSIDED_FOLIAGE: return float3(0.2f, 0.2f, 0.8f); // Cyan
		case SHADINGMODELID_HAIR: return float3(0.6f, 0.1f, 0.5f);
		case SHADINGMODELID_CLOTH: return float3(0.7f, 1.0f, 1.0f);
		case SHADINGMODELID_EYE: return float3(0.3f, 1.0f, 1.0f);
		case SHADINGMODELID_SINGLELAYERWATER: return float3(0.5f, 0.5f, 1.0f);
		case SHADINGMODELID_THIN_TRANSLUCENT: return float3(1.0f, 0.8f, 0.3f);
		case SHADINGMODELID_STRATA: return float3(1.0f, 1.0f, 0.0f);
		case SHADINGMODELID_TOON: return float3(0.75f, 0.75f, 0.1f);
		default: return float3(1.0f, 1.0f, 1.0f); // White
	}
#endif
}
```

判断是否有写入CustomData

```C++
//DeferredShadingCommon.ush
bool HasCustomGBufferData(int ShadingModelID)
{
	return ShadingModelID == SHADINGMODELID_SUBSURFACE
		|| ShadingModelID == SHADINGMODELID_PREINTEGRATED_SKIN
		|| ShadingModelID == SHADINGMODELID_CLEAR_COAT
		|| ShadingModelID == SHADINGMODELID_SUBSURFACE_PROFILE
		|| ShadingModelID == SHADINGMODELID_TWOSIDED_FOLIAGE
		|| ShadingModelID == SHADINGMODELID_HAIR
		|| ShadingModelID == SHADINGMODELID_CLOTH
		|| ShadingModelID == SHADINGMODELID_EYE
		|| ShadingModelID == SHADINGMODELID_TOON;
}
```

定义写入将CustomData写入GBuffer

```C++
//BasePassCommon.ush
#define NEEDS_LIGHTMAP						(NEEDS_LIGHTMAP_COORDINATE)

#define USES_GBUFFER						(FEATURE_LEVEL >= FEATURE_LEVEL_SM4 && (MATERIALBLENDING_SOLID || MATERIALBLENDING_MASKED) && !FORWARD_SHADING)

// Only some shader models actually need custom data.
#define WRITES_CUSTOMDATA_TO_GBUFFER		(USES_GBUFFER && (MATERIAL_SHADINGMODEL_SUBSURFACE || MATERIAL_SHADINGMODEL_PREINTEGRATED_SKIN || MATERIAL_SHADINGMODEL_SUBSURFACE_PROFILE || MATERIAL_SHADINGMODEL_CLEAR_COAT || MATERIAL_SHADINGMODEL_TWOSIDED_FOLIAGE || MATERIAL_SHADINGMODEL_HAIR || MATERIAL_SHADINGMODEL_CLOTH || MATERIAL_SHADINGMODEL_EYE || MATERIAL_SHADINGMODEL_TOON))
```

将CustomData写入GBuffer

```C++
//ShadingModelsMaterial.ush
#if MATERIAL_SHADINGMODEL_EYE
	else if (ShadingModel == SHADINGMODELID_EYE)
	{
		const float IrisMask     = saturate(GetMaterialCustomData0(MaterialParameters));
		const float IrisDistance = saturate(GetMaterialCustomData1(MaterialParameters));

		GBuffer.CustomData.x = EncodeSubsurfaceProfile(SubsurfaceProfile).x;
		GBuffer.CustomData.w = 1.0f - IrisMask;	// Opacity

	#if IRIS_NORMAL
		float2 WorldNormalOct = UnitVectorToOctahedron( GBuffer.WorldNormal );

		// CausticNormal stored as octahedron
		#if NUM_MATERIAL_OUTPUTS_GETTANGENTOUTPUT > 0
			// Blend in the negative intersection normal to create some concavity
			// Not great as it ties the concavity to the convexity of the cornea surface
			// No good justification for that. On the other hand, if we're just looking to
			// introduce some concavity, this does the job.
			float3 PlaneNormal = normalize( GetTangentOutput0(MaterialParameters) );
			float3 CausticNormal = normalize( lerp( PlaneNormal, -GBuffer.WorldNormal, IrisMask*IrisDistance ) );
			float2 CausticNormalOct  = UnitVectorToOctahedron( CausticNormal );
			float2 CausticNormalDelta = ( CausticNormalOct - WorldNormalOct ) * 0.5 + (128.0/255.0);
			GBuffer.Metallic = CausticNormalDelta.x;
			GBuffer.Specular = CausticNormalDelta.y;
		#else
			float3 PlaneNormal = GBuffer.WorldNormal;
			GBuffer.Metallic = 128.0/255.0;
			GBuffer.Specular = 128.0/255.0;
		#endif

		// IrisNormal CustomData.yz
		#if NUM_MATERIAL_OUTPUTS_CLEARCOATBOTTOMNORMAL > 0
			float3 IrisNormal = normalize( ClearCoatBottomNormal0(MaterialParameters) );
			#if MATERIAL_TANGENTSPACENORMAL
				IrisNormal = normalize( TransformTangentVectorToWorld( MaterialParameters.TangentToWorld, IrisNormal ) );
			#endif
		#else
			float3 IrisNormal = PlaneNormal;
		#endif

		float2 IrisNormalOct  = UnitVectorToOctahedron( IrisNormal );
		float2 IrisNormalDelta = ( IrisNormalOct - WorldNormalOct ) * 0.5 + (128.0/255.0);
		GBuffer.CustomData.yz = IrisNormalDelta;
	#else
		GBuffer.Metallic = IrisDistance;

		#if NUM_MATERIAL_OUTPUTS_GETTANGENTOUTPUT > 0
			float3 Tangent = GetTangentOutput0(MaterialParameters);
			GBuffer.CustomData.yz = UnitVectorToOctahedron( normalize(Tangent) ) * 0.5 + 0.5;
		#endif
	#endif

	#if SHADING_PATH_MOBILE
		#if MATERIAL_SHADINGMODEL_EYE_USE_CURVATURE
			GBuffer.Curvature = Metallic;
		#else
			GBuffer.Curvature = CalculateCurvature(GBuffer.WorldNormal, MaterialParameters.WorldPosition_CamRelative);
		#endif

		GBuffer.Curvature = clamp(GBuffer.Curvature, 0.001f, 1.0f);
	#endif
	}
#endif

#if MATERIAL_SHADINGMODEL_TOON
	else if (ShadingModel == SHADINGMODELID_TOON)
	{
		GBuffer.CustomData.x = saturate( GetMaterialCustomData0(MaterialParameters) );
		GBuffer.CustomData.y = saturate( GetMaterialCustomData1(MaterialParameters) );
	}
#endif
```

做完了以上工作，接下来是真正对光照计算和光照模型进行修改的地方，后续对效果的调试也主要集中在这里

根据ShadingModelID选择BxDF

```C++
//ShadingModels.ush
FDirectLighting IntegrateBxDF( FGBufferData GBuffer, half3 N, half3 V, half3 L, float Falloff, half NoL, FAreaLight AreaLight, FShadowTerms Shadow )
{
	switch( GBuffer.ShadingModelID )
	{
		case SHADINGMODELID_DEFAULT_LIT:
		case SHADINGMODELID_SINGLELAYERWATER:
		case SHADINGMODELID_THIN_TRANSLUCENT:
			return DefaultLitBxDF( GBuffer, N, V, L, Falloff, NoL, AreaLight, Shadow );
		case SHADINGMODELID_SUBSURFACE:
			return SubsurfaceBxDF( GBuffer, N, V, L, Falloff, NoL, AreaLight, Shadow );
		case SHADINGMODELID_PREINTEGRATED_SKIN:
			return PreintegratedSkinBxDF( GBuffer, N, V, L, Falloff, NoL, AreaLight, Shadow );
		case SHADINGMODELID_CLEAR_COAT:
			return ClearCoatBxDF( GBuffer, N, V, L, Falloff, NoL, AreaLight, Shadow );
		case SHADINGMODELID_SUBSURFACE_PROFILE:
			return SubsurfaceProfileBxDF( GBuffer, N, V, L, Falloff, NoL, AreaLight, Shadow );
		case SHADINGMODELID_TWOSIDED_FOLIAGE:
			return TwoSidedBxDF( GBuffer, N, V, L, Falloff, NoL, AreaLight, Shadow );
		case SHADINGMODELID_HAIR:
			return HairBxDF( GBuffer, N, V, L, Falloff, NoL, AreaLight, Shadow );
		case SHADINGMODELID_CLOTH:
			return ClothBxDF( GBuffer, N, V, L, Falloff, NoL, AreaLight, Shadow );
		case SHADINGMODELID_EYE:
			return EyeBxDF( GBuffer, N, V, L, Falloff, NoL, AreaLight, Shadow );
		case SHADINGMODELID_TOON:
			return ToonBxDF( GBuffer, N, V, L, Falloff, NoL, AreaLight, Shadow );
		default:
			return (FDirectLighting)0;
	}
}
```

定义BxDF

```C++
FDirectLighting ToonBxDF(FGBufferData GBuffer, half3 N, half3 V, half3 L, float Falloff, float NoL, FAreaLight AreaLight, FShadowTerms Shadow)
{
#if GBUFFER_HAS_TANGENT
	half3 X = GBuffer.WorldTangent;
	half3 Y = normalize(cross(N, X));
#else
	half3 X = 0;
	half3 Y = 0;
#endif
	
	BxDFContext Context;
	Init(Context, N, X, Y, V, L);
	SphereMaxNoH(Context, AreaLight.SphereSinAlpha, true);
	Context.NoV = saturate(abs(Context.NoV) + 1e-5);

	float SpecularOffset = 0.5;
	float SpecularRange = GBuffer.CustomData.x;

	float3 ShadowColor = 0;
	
	ShadowColor = GBuffer.DiffuseColor * ShadowColor;
	float offset = GBuffer.CustomData.y;
	float SoftScatterStrength = 0;

	offset = offset * 2 - 1;
	half3 H = normalize(V + L);
	float NoH = saturate(dot(N, H));
	NoL = (dot(N, L) + 1) / 2; // overwrite NoL to get more range out of it
	half NoLOffset = saturate(NoL + offset);
	
	FDirectLighting Lighting;
	Lighting.Diffuse = AreaLight.FalloffColor * (smoothstep(0, 1, NoLOffset) * Falloff) * Diffuse_Lambert(GBuffer.DiffuseColor) * 2.2;

	float InScatter = pow(saturate(dot(L, -V)), 12) * lerp(3, .1f, 1);
	float NormalContribution = saturate(dot(N, H));
	float BackScatter = GBuffer.GBufferAO * NormalContribution / (PI * 2);

	Lighting.Specular = ToonStep(SpecularRange, (saturate(D_GGX(SpecularOffset, NoH)))) * (AreaLight.FalloffColor * GBuffer.SpecularColor * Falloff * 8);

	float3 TransmissionSoft = AreaLight.FalloffColor * (Falloff * lerp(BackScatter, 1, InScatter)) * ShadowColor * SoftScatterStrength;
	float3 ShadowLightener = (saturate(smoothstep(0, 1, saturate(1 - NoLOffset))) * ShadowColor * 0.1);
	
	Lighting.Transmission = (ShadowLightener + TransmissionSoft) * Falloff;
	return Lighting;
}
```

更改光照的计算，主要为了实现卡通渲染的梯度衰减光照

```C++
//DeferredLightingCommon.ush
BRANCH
	if( LightMask > 0 )
	{
		FShadowTerms Shadow;
		Shadow.SurfaceShadow = AmbientOcclusion;
		Shadow.TransmissionShadow = 1;
		Shadow.TransmissionThickness = 1;
		Shadow.HairTransmittance.OpaqueVisibility = 1;
		const float ContactShadowOpacity = GBuffer.CustomData.a;
		GetShadowTerms(GBuffer.Depth, GBuffer.PrecomputedShadowFactors, GBuffer.ShadingModelID, ContactShadowOpacity,
			LightData, TranslatedWorldPosition, L, LightAttenuation, Dither, Shadow);
		SurfaceShadow = Shadow.SurfaceShadow;

		LightAccumulator.EstimatedCost += 0.3f;		// add the cost of getting the shadow terms
		
		float3 Attenuation = 1;
		BRANCH
		if (GBuffer.ShadingModelID == SHADINGMODELID_TOON)
		{
			float offset = GBuffer.CustomData.y;
			float TerminatorRange = saturate(GBuffer.Roughness - 0.5);
				
			offset = offset * 2 - 1;
				
			BRANCH
			if (offset >= 1)
			{
				Attenuation = 1;
			}
			else
			{
				float NoL = (dot(N, L) + 1) / 2;
				float NoLOffset = saturate(NoL + offset);
				float LightAttenuationOffset = saturate( Shadow.SurfaceShadow + offset);
				float ToonSurfaceShadow = smoothstep(0.5 - TerminatorRange, 0.5 + TerminatorRange, LightAttenuationOffset);

				Attenuation = smoothstep(0.5 - TerminatorRange, 0.5 + TerminatorRange, NoLOffset) * ToonSurfaceShadow;
			}
		}


#if SHADING_PATH_MOBILE
		const bool bNeedsSeparateSubsurfaceLightAccumulation = UseSubsurfaceProfile(GBuffer.ShadingModelID);
		
		FDirectLighting Lighting = (FDirectLighting)0;

		half NoL = max(0, dot(GBuffer.WorldNormal, L));
	#if TRANSLUCENCY_NON_DIRECTIONAL
		NoL = 1.0f;
	#endif
		Lighting = EvaluateBxDF(GBuffer, N, V, L, NoL, Shadow);

		Lighting.Specular *= LightData.SpecularScale;
	
		LightAccumulator_AddSplit( LightAccumulator, Lighting.Diffuse, Lighting.Specular, Lighting.Diffuse, MaskedLightColor * Shadow.SurfaceShadow * Attenuation, bNeedsSeparateSubsurfaceLightAccumulation );
		LightAccumulator_AddSplit( LightAccumulator, Lighting.Transmission, 0.0f, Lighting.Transmission, MaskedLightColor * Shadow.TransmissionShadow, bNeedsSeparateSubsurfaceLightAccumulation );
#else // SHADING_PATH_MOBILE
		BRANCH
		if( Shadow.SurfaceShadow + Shadow.TransmissionShadow > 0 )
		{
			const bool bNeedsSeparateSubsurfaceLightAccumulation = UseSubsurfaceProfile(GBuffer.ShadingModelID);

		#if NON_DIRECTIONAL_DIRECT_LIGHTING
			float Lighting;

			if( LightData.bRectLight )
			{
				FRect Rect = GetRect( ToLight, LightData );

				Lighting = IntegrateLight( Rect );
			}
			else
			{
				FCapsuleLight Capsule = GetCapsule( ToLight, LightData );

				Lighting = IntegrateLight( Capsule, LightData.bInverseSquared );
			}

			float3 LightingDiffuse = Diffuse_Lambert( GBuffer.DiffuseColor ) * Lighting;

			LightAccumulator_AddSplit(LightAccumulator, LightingDiffuse, 0.0f, 0, MaskedLightColor * Shadow.SurfaceShadow * Attenuation, bNeedsSeparateSubsurfaceLightAccumulation);
		#else
			FDirectLighting Lighting;

			if (LightData.bRectLight)
			{
				FRect Rect = GetRect( ToLight, LightData );
				const FRectTexture SourceTexture = ConvertToRectTexture(LightData);

				#if REFERENCE_QUALITY
					Lighting = IntegrateBxDF( GBuffer, N, V, Rect, Shadow, SourceTexture, SVPos );
				#else
					Lighting = IntegrateBxDF( GBuffer, N, V, Rect, Shadow, SourceTexture);
				#endif
			}
			else
			{
				FCapsuleLight Capsule = GetCapsule( ToLight, LightData );

				#if REFERENCE_QUALITY
					Lighting = IntegrateBxDF( GBuffer, N, V, Capsule, Shadow, SVPos );
				#else
					Lighting = IntegrateBxDF( GBuffer, N, V, Capsule, Shadow, LightData.bInverseSquared );
				#endif
			}

			Lighting.Specular *= LightData.SpecularScale;

			LightAccumulator_AddSplit( LightAccumulator, Lighting.Diffuse, Lighting.Specular, Lighting.Diffuse, MaskedLightColor * Shadow.SurfaceShadow * Attenuation, bNeedsSeparateSubsurfaceLightAccumulation );
			LightAccumulator_AddSplit( LightAccumulator, Lighting.Transmission, 0.0f, Lighting.Transmission, MaskedLightColor * Shadow.TransmissionShadow, bNeedsSeparateSubsurfaceLightAccumulation );

			LightAccumulator.EstimatedCost += 0.4f;		// add the cost of the lighting computations (should sum up to 1 form one light)
		#endif
		}
#endif // SHADING_PATH_MOBILE
	}
```

同时新建了一个文件用来存放新的ShadingModel相关的自定义函数

```C++
//ToonShadingCommon.ush
float3 ToonStep(float feather, float halfLambert, float threshold = 0.5f)
{
	return smoothstep(threshold - feather, threshold + feather, halfLambert);
}
```

到这里应该算是已经大功告成了，已经可以在材质中连线，看到基本的卡通渲染的效果，只不过，这个效果依旧是远远不尽如人意的，如果想要做出自己心中的效果，还是得在这个框架的基础上，对光照计算改改改才行。上述的开发流程，以及光照计算的代码也参考了不少知乎上的文章，随便搜搜Shading Model的关键字就能搜到不少。而这篇文章的目的主要还是希望帮助刚开始对着代码着手开发的小伙伴，能够快速理清这整个流程和思路，以便在后续的开发中少踩一些坑。

这篇就这样子吧，后续应该还会写写在描边开发的过程中踩的一些坑。